import {
  ACADEMY_MEDIA_MIME_TYPES,
  ACADEMY_PHOTO_MAX_BYTES,
  ACADEMY_VIDEO_MAX_BYTES,
  type AcademyClassDto,
  type AcademyDto,
  type AcademySummaryDto,
  type AcademyVideoDto,
  type AcademyVideoReportDto,
  type AcademyVideoUploadTicket,
  type ChileRegion,
  type ClassLevel,
  type DanceStyle,
} from '@baile-latino/types';
import { api, API_BASE, ApiError, uploadForm } from './api';

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/** Orden de la semana para mostrar el horario (lunes primero). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const LEVEL_LABEL: Record<ClassLevel, string> = {
  BASICO: 'Básico',
  INTERMEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
  TODOS: 'Todo nivel',
};

/** Cambia cuando se sube o quita un logo en esta sesión: la API lo cachea 1 h. */
let logoVersion = String(Date.now());

export function academyLogoUrl(a: Pick<AcademySummaryDto, 'id' | 'hasLogo'>): string | null {
  if (!a.hasLogo) return null;
  return `${API_BASE}/academies/${a.id}/logo?v=${logoVersion}`;
}

export interface AcademyFormValues {
  name: string;
  region: ChileRegion | '';
  city: string;
  address: string;
  styles: DanceStyle[];
  description: string;
  instagramHandle: string;
}

export const EMPTY_ACADEMY: AcademyFormValues = {
  name: '',
  region: '',
  city: '',
  address: '',
  styles: [],
  description: '',
  instagramHandle: '',
};

export function academyFormFrom(a: AcademyDto): AcademyFormValues {
  return {
    name: a.name,
    region: a.region,
    city: a.city ?? '',
    address: a.address ?? '',
    styles: a.styles,
    description: a.description ?? '',
    instagramHandle: a.instagramHandle ?? '',
  };
}

function academyPayload(v: AcademyFormValues) {
  const opt = (s: string) => s.trim() || null;
  return {
    name: v.name.trim(),
    region: v.region || undefined,
    city: opt(v.city),
    address: opt(v.address),
    styles: v.styles,
    description: opt(v.description),
    instagramHandle: opt(v.instagramHandle),
  };
}

export function validateAcademy(v: AcademyFormValues): string | null {
  if (v.name.trim().length < 2) return 'Ponle un nombre a la academia.';
  if (!v.region) return 'Elige la región.';
  if (v.instagramHandle.trim() && !/^@?[A-Za-z0-9._]{1,30}$/.test(v.instagramHandle.trim())) {
    return 'El usuario de Instagram no es válido.';
  }
  return null;
}

export interface ClassFormValues {
  title: string;
  style: DanceStyle | '';
  level: ClassLevel;
  weekday: number;
  startTime: string;
  durationMin: string;
  teacherName: string;
  place: string;
  priceInfo: string;
  description: string;
  active: boolean;
}

export const EMPTY_CLASS: ClassFormValues = {
  title: '',
  style: '',
  level: 'TODOS',
  weekday: 1,
  startTime: '20:00',
  durationMin: '60',
  teacherName: '',
  place: '',
  priceInfo: '',
  description: '',
  active: true,
};

export function classFormFrom(c: AcademyClassDto): ClassFormValues {
  return {
    title: c.title,
    style: c.style ?? '',
    level: c.level,
    weekday: c.weekday,
    startTime: c.startTime,
    durationMin: String(c.durationMin),
    teacherName: c.teacherName ?? '',
    place: c.place ?? '',
    priceInfo: c.priceInfo ?? '',
    description: c.description ?? '',
    active: c.active,
  };
}

function classPayload(v: ClassFormValues) {
  const opt = (s: string) => s.trim() || null;
  return {
    title: v.title.trim(),
    style: v.style || null,
    level: v.level,
    weekday: v.weekday,
    startTime: v.startTime,
    durationMin: Number(v.durationMin) || 60,
    teacherName: opt(v.teacherName),
    place: opt(v.place),
    priceInfo: opt(v.priceInfo),
    description: opt(v.description),
    active: v.active,
  };
}

/** "20:00 – 21:00". */
export function classTimeRange(c: Pick<AcademyClassDto, 'startTime' | 'durationMin'>): string {
  const [h, m] = c.startTime.split(':').map(Number);
  const end = h * 60 + m + c.durationMin;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${c.startTime} – ${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export function formatVideoDuration(ms: number | null): string {
  if (ms === null) return '';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// --- videos ---------------------------------------------------------------------

/** Formato de un video o foto aceptado, o null. */
export function mediaMimeType(file: File): string | null {
  const allowed = ACADEMY_MEDIA_MIME_TYPES as readonly string[];
  if (allowed.includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return ext ? (byExt[ext] ?? null) : null;
}

export const isPhotoMime = (mime: string) => mime.startsWith('image/');

/** Tamaño máximo según el tipo. */
export function mediaMaxBytes(mime: string): number {
  return isPhotoMime(mime) ? ACADEMY_PHOTO_MAX_BYTES : ACADEMY_VIDEO_MAX_BYTES;
}

/** Miniatura JPG (máx. 640 px de ancho) de una foto. */
function photoThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = Math.min(640, img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Duración y miniatura sacadas por el navegador (sin usar CPU del servidor). Si el
 * navegador no puede leer el video (p. ej. HEVC del iPhone en Chrome/Windows),
 * devuelve nulls: el video se sube igual, sin miniatura.
 */
export function videoPreview(file: File): Promise<{ durationMs: number | null; thumb: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let durationMs: number | null = null;
    const done = (thumb: Blob | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve({ durationMs, thumb });
    };
    const timer = setTimeout(() => done(null), 15_000);
    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) durationMs = Math.round(video.duration * 1000);
      video.currentTime = Math.min(2, (video.duration || 0) / 10);
    };
    video.onseeked = () => {
      const w = Math.min(640, video.videoWidth);
      if (!w || !video.videoHeight) return done(null);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * w);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => done(b), 'image/jpeg', 0.8);
    };
    video.src = url;
  });
}

/** PUT directo al storage con progreso (fetch no informa progreso de subida). */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, 'No se pudo subir el video.'));
    xhr.onerror = () => reject(new ApiError(0, 'Se cortó la conexión al subir el video.'));
    xhr.send(body);
  });
}

const HASH_CHUNK = 8 * 1024 * 1024;

/**
 * Huella SHA-256 (hex) del contenido del archivo, leyéndolo por partes (sirve
 * para videos de 3 GB sin cargarlos enteros en memoria). Dos archivos con la
 * misma huella son idénticos, aunque tengan otro nombre.
 */
export async function fileHash(file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const { createSHA256 } = await import('hash-wasm');
  const hasher = await createSHA256();
  hasher.init();
  for (let pos = 0; pos < file.size; pos += HASH_CHUNK) {
    const buf = await file.slice(pos, pos + HASH_CHUNK).arrayBuffer();
    hasher.update(new Uint8Array(buf));
    onProgress?.(Math.min(1, (pos + HASH_CHUNK) / file.size));
  }
  return hasher.digest('hex');
}

/** Inicio del mensaje de la API cuando el archivo ya está (ver academy-videos.service.ts). */
const DUPLICATE_PREFIX = 'Ya está en la galería:';
export const isDuplicateError = (e: unknown) =>
  e instanceof ApiError && e.status === 409 && e.message.startsWith(DUPLICATE_PREFIX);

export interface VideoUploadInput {
  file: File;
  /** SHA-256 del archivo (para que la API rechace un repetido). */
  contentHash?: string;
  title: string;
  classId: string | null;
  style: DanceStyle | null;
  recordedOn: string | null;
  description: string | null;
}

/** Pide las URLs firmadas, sube miniatura y archivo (video o foto) directo al storage y lo confirma. */
export async function uploadAcademyVideo(
  academyId: string,
  input: VideoUploadInput,
  onProgress: (fraction: number) => void,
): Promise<AcademyVideoDto> {
  const mimeType = mediaMimeType(input.file);
  if (!mimeType) throw new ApiError(400, 'Formato no permitido. Usa MP4, MOV o WEBM (video) o JPG, PNG o WEBP (foto).');
  const preview = isPhotoMime(mimeType)
    ? { durationMs: null, thumb: await photoThumb(input.file) }
    : await videoPreview(input.file);
  const ticket = await api<AcademyVideoUploadTicket>(`/academies/${academyId}/videos`, {
    method: 'POST',
    body: {
      title: input.title,
      mimeType,
      sizeBytes: input.file.size,
      classId: input.classId,
      style: input.style,
      recordedOn: input.recordedOn,
      description: input.description,
      contentHash: input.contentHash,
    },
  });
  if (preview.thumb) {
    await putWithProgress(ticket.thumbUploadUrl, ticket.thumbUploadHeaders, preview.thumb).catch(() => undefined);
  }
  await putWithProgress(ticket.uploadUrl, ticket.uploadHeaders, input.file, onProgress);
  return api<AcademyVideoDto>(`/academies/${academyId}/videos/${ticket.videoId}/complete`, {
    method: 'POST',
    body: preview.durationMs !== null ? { durationMs: preview.durationMs } : {},
  });
}

// --- llamadas a la API ----------------------------------------------------------

export const academiesApi = {
  list: (region?: ChileRegion | '') =>
    api<AcademySummaryDto[]>(`/academies${region ? `?region=${region}` : ''}`),
  mine: () => api<AcademySummaryDto[]>('/academies/mine'),
  get: (id: string) => api<AcademyDto>(`/academies/${id}`),
  create: (v: AcademyFormValues, logo: File | null) => {
    const fd = new FormData();
    fd.append('data', JSON.stringify(academyPayload(v)));
    if (logo) fd.append('file', logo);
    return uploadForm<AcademyDto>('/academies', fd);
  },
  update: (id: string, v: AcademyFormValues) =>
    api<AcademyDto>(`/academies/${id}`, { method: 'PATCH', body: academyPayload(v) }),
  setLogo: (id: string, logo: File) => {
    const fd = new FormData();
    fd.append('file', logo);
    logoVersion = String(Date.now());
    return uploadForm<AcademyDto>(`/academies/${id}/logo`, fd, 'PUT');
  },
  clearLogo: (id: string) => {
    logoVersion = String(Date.now());
    return api<AcademyDto>(`/academies/${id}/logo`, { method: 'DELETE' });
  },
  remove: (id: string) => api<void>(`/academies/${id}`, { method: 'DELETE' }),
  addMember: (id: string, email: string) =>
    api<AcademyDto>(`/academies/${id}/members`, { method: 'POST', body: { email } }),
  removeMember: (id: string, userId: string) =>
    api<AcademyDto>(`/academies/${id}/members/${userId}`, { method: 'DELETE' }),
  createClass: (id: string, v: ClassFormValues) =>
    api<AcademyClassDto>(`/academies/${id}/classes`, { method: 'POST', body: classPayload(v) }),
  updateClass: (id: string, classId: string, v: ClassFormValues) =>
    api<AcademyClassDto>(`/academies/${id}/classes/${classId}`, { method: 'PATCH', body: classPayload(v) }),
  removeClass: (id: string, classId: string) =>
    api<void>(`/academies/${id}/classes/${classId}`, { method: 'DELETE' }),
  videos: (id: string, classId?: string) =>
    api<AcademyVideoDto[]>(`/academies/${id}/videos${classId ? `?classId=${classId}` : ''}`),
  videoUrl: (id: string, videoId: string) => api<{ url: string }>(`/academies/${id}/videos/${videoId}/url`),
  updateVideo: (
    id: string,
    videoId: string,
    body: { title?: string; classId?: string | null; style?: DanceStyle | null; recordedOn?: string | null; description?: string | null },
  ) => api<AcademyVideoDto>(`/academies/${id}/videos/${videoId}`, { method: 'PATCH', body }),
  removeVideo: (id: string, videoId: string) =>
    api<void>(`/academies/${id}/videos/${videoId}`, { method: 'DELETE' }),
  /** De las huellas dadas, cuáles ya están en la galería. */
  duplicates: (id: string, hashes: string[]) =>
    api<{ hash: string; videoId: string; title: string }[]>(`/academies/${id}/videos/duplicates`, {
      method: 'POST',
      body: { hashes },
    }),
  reportVideo: (id: string, videoId: string, reason: string) =>
    api<void>(`/academies/${id}/videos/${videoId}/report`, { method: 'POST', body: { reason } }),
  reports: () => api<AcademyVideoReportDto[]>('/academies/reports'),
  resolveReport: (reportId: string) => api<void>(`/academies/reports/${reportId}/resolve`, { method: 'POST' }),
};
