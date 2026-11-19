import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from '@baile-latino/types';

/** Base de la API (EXPO_PUBLIC_API_URL; por defecto, producción). */
export const API_BASE = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://api.nectason.app/api/v1'
).replace(/\/$/, '');

const ACCESS_KEY = 'nectason.access';
const REFRESH_KEY = 'nectason.refresh';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// --- tokens: en el almacenamiento seguro del teléfono (Keychain / Keystore) ---
// En memoria también, para no leer el almacenamiento en cada petición.
let accessToken: string | null = null;
let refreshToken: string | null = null;
let loaded = false;

async function loadTokens(): Promise<void> {
  if (loaded) return;
  [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  loaded = true;
}

export async function hasSession(): Promise<boolean> {
  await loadTokens();
  return Boolean(accessToken || refreshToken);
}

export async function setTokens(t: AuthTokens): Promise<void> {
  accessToken = t.accessToken;
  refreshToken = t.refreshToken;
  loaded = true;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, t.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  loaded = true;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

/** Para pedir imágenes protegidas (<Image source={{ uri, headers }} />). */
export function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') return body.message;
    if (Array.isArray(body?.message)) return body.message.join(', ');
  } catch {
    /* sin body json */
  }
  return `Error ${res.status}`;
}

/**
 * Refresco compartido: el backend ROTA el refresh token en cada uso, así que si
 * varias peticiones vencen a la vez deben esperar el mismo refresco (igual que la web).
 */
let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  await setTokens((await res.json()) as AuthTokens);
  return true;
}

async function tryRefresh(): Promise<boolean> {
  const before = accessToken;
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  const ok = await refreshInFlight;
  return ok || Boolean(accessToken && accessToken !== before);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** FormData (multipart): se manda tal cual. */
  form?: FormData;
  _retried?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  await loadTokens();
  const hasJson = opts.body !== undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      // Solo con body: Fastify rechaza un JSON vacío.
      ...(hasJson ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
    },
    body: opts.form ?? (hasJson ? JSON.stringify(opts.body) : undefined),
  });

  if (res.status === 401 && !opts._retried) {
    if (await tryRefresh()) return api<T>(path, { ...opts, _retried: true });
    await clearTokens();
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
