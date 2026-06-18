import type { AuthTokens } from '@baile-latino/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const ACCESS_KEY = 'bl_access';
const REFRESH_KEY = 'bl_refresh';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// --- almacenamiento de tokens (localStorage) -------------------------------
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}
function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}
export function setTokens(tokens: AuthTokens): void {
  window.localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}
export function clearTokens(): void {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') return body.message;
    if (Array.isArray(body?.message)) return body.message.join(', ');
  } catch {
    /* sin body json */
  }
  return res.statusText || `Error ${res.status}`;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const tokens = (await res.json()) as AuthTokens;
  setTokens(tokens);
  return true;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Reintenta tras refrescar el token (uso interno). */
  _retried?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = getAccessToken();
  const hasBody = opts.body !== undefined;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    cache: 'no-store',
    headers: {
      // Solo enviar Content-Type cuando hay body (Fastify rechaza JSON vacío).
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !opts._retried) {
    const refreshed = await tryRefresh();
    if (refreshed) return api<T>(path, { ...opts, _retried: true });
    clearTokens();
  }

  if (!res.ok) throw new ApiError(res.status, await parseError(res));

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Sube un archivo (multipart) a un endpoint protegido y devuelve el JSON. */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = getAccessToken();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return (await res.json()) as T;
}

/** Descarga un archivo protegido (p. ej. el Excel) y dispara el guardado. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
