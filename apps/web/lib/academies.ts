import {
  ACADEMY_MEDIA_MIME_TYPES,
  ACADEMY_PHOTO_MAX_BYTES,
  ACADEMY_VIDEO_MAX_BYTES,
  type AcademyAdminRowDto,
  type AcademyClassDto,
  type AcademyDto,
  type AcademyEnrollmentDto,
  type AcademyEnrollmentStatus,
  type MyEnrollmentDto,
  type AcademyMemberRole,
  type AcademyShareLinkDto,
  type AcademySummaryDto,
  type AcademyVideoDto,
  type AcademyVideoReportDto,
  type AcademyVideoUploadTicket,
  type ChileRegion,
  type ClassLevel,
  type DanceStyle,
  type SharedClassDto,
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
  commune: string;
  address: string;
  styles: DanceStyle[];
  description: string;
  instagramHandle: string;
}

export const EMPTY_ACADEMY: AcademyFormValues = {
  name: '',
  region: '',
  city: '',
  commune: '',
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
    commune: a.commune ?? '',
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
    commune: opt(v.commune),
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
  /** Cupo de alumnos ('' = sin cupo). */
  capacity: string;
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
  capacity: '',
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
    capacity: c.capacity != null ? String(c.capacity) : '',
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
    capacity: v.capacity.trim() ? Math.max(1, Math.round(Number(v.capacity))) : null,
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

/** original = el archivo tal como se subió; mp4 = la copia compatible (H.264). */
export type DownloadFormat = 'original' | 'mp4';

/** ¿Hay un MP4 que se pueda descargar? (la copia lista, o el original ya es MP4). */
export function hasMp4(v: { mimeType: string; compat: { status: string | null } }): boolean {
  return v.compat.status === 'DONE' || (v.mimeType === 'video/mp4' && v.compat.status !== 'DONE');
}

/** Texto del estado de la copia para quien administra (null = nada que mostrar). */
export function compatLabel(v: { kind: string; compat: { status: string | null } }): string | null {
  if (v.kind !== 'VIDEO') return null;
  switch (v.compat.status) {
    case 'PENDING':
    case 'PROCESSING':
      return '⏳ Preparando versión MP4…';
    case 'TOO_LONG':
      return 'Sin versión MP4 (dura más de 15 min)';
    case 'ERROR':
      return '⚠ No se pudo crear la versión MP4';
    default:
      return null;
  }
}

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const KNOWN_EXT = /\.(mp4|m4v|mov|webm|jpe?g|png|webp)$/i;

/**
 * Extensión que falta mostrar junto al título (".mp4"), o '' si el título ya
 * termina en una extensión.
 */
export function missingExtension(v: { title: string; mimeType: string }): string {
  if (KNOWN_EXT.test(v.title.trim())) return '';
  const ext = EXT_BY_MIME[v.mimeType];
  return ext ? `.${ext}` : '';
}

/** Tamaño máximo según el tipo. */
export function mediaMaxBytes(mime: string): number {
  return isPhotoMime(mime) ? ACADEMY_PHOTO_MAX_BYTES : ACADEMY_VIDEO_MAX_BYTES;
}

/** Miniatura JPG (máx. 640 px de ancho) de una foto. */
export function photoThumb(file: File): Promise<Blob | null> {
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

/** Espera a que el cuadro buscado esté de verdad pintado (si no, a veces sale negro). */
function frameReady(video: HTMLVideoElement): Promise<void> {
  const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 300);
    v.requestVideoFrameCallback?.(() => {
      clearTimeout(fallback);
      resolve();
    });
  });
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error('video'));
    video.currentTime = t;
  });
}

/** Dibuja el cuadro actual (máx. 640 px). null si salió (casi) negro. */
function drawFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const w = Math.min(640, video.videoWidth);
  if (!w || !video.videoHeight) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * w);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  // Brillo promedio de una muestra: los videos HDR/HEVC del iPhone a veces se dibujan negros.
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 97) {
    sum += data[i] + data[i + 1] + data[i + 2];
    n++;
  }
  if (n === 0 || sum / (n * 3) < 6) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
}

/**
 * Duración y miniatura sacadas por el navegador (sin usar CPU del servidor). Si el
 * cuadro sale negro, prueba en otros momentos (25 % y 50 % del video); si el
 * navegador no puede leerlo o todos salen negros, la miniatura queda en null (la
 * galería muestra un ícono, y quien administra puede elegir un cuadro después).
 */
export function videoPreview(file: File): Promise<{ durationMs: number | null; thumb: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    let durationMs: number | null = null;
    let finished = false;
    const done = (thumb: Blob | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve({ durationMs, thumb });
    };
    const timer = setTimeout(() => done(null), 20_000);
    video.onerror = () => done(null);
    video.onloadedmetadata = async () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      if (d) durationMs = Math.round(d * 1000);
      for (const t of [Math.min(2, d / 10), d * 0.25, d * 0.5]) {
        try {
          await seek(video, t);
          await frameReady(video);
          const thumb = await drawFrame(video);
          if (thumb) return done(thumb);
        } catch {
          return done(null);
        }
      }
      done(null);
    };
    video.src = url;
  });
}

/**
 * Cuadro de un video ya subido (URL firmada) en el segundo dado, como JPG. Usa un
 * <video> aparte con CORS (el del reproductor no se toca). null si sale negro o el
 * navegador no lo puede leer.
 */
export function frameFromUrl(url: string, timeSec: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const timer = setTimeout(() => resolve(null), 20_000);
    video.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    video.onloadedmetadata = async () => {
      try {
        await seek(video, Math.min(timeSec, Math.max(0, video.duration - 0.1)));
        await frameReady(video);
        const b = await drawFrame(video);
        clearTimeout(timer);
        resolve(b);
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    };
    video.src = url;
  });
}

/** Reemplaza la miniatura de un video por el JPG dado (dueño y profesores). */
export async function replaceThumbnail(academyId: string, videoId: string, jpg: Blob): Promise<AcademyVideoDto> {
  const t = await api<{ uploadUrl: string; uploadHeaders: Record<string, string> }>(
    `/academies/${academyId}/videos/${videoId}/thumb`,
    { method: 'POST' },
  );
  await putWithProgress(t.uploadUrl, t.uploadHeaders, jpg);
  return api<AcademyVideoDto>(`/academies/${academyId}/videos/${videoId}/thumb/complete`, { method: 'POST' });
}

/** PUT directo al storage con progreso (fetch no informa progreso de subida). */
export function putWithProgress(
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
  try {
    if (preview.thumb) {
      await putWithProgress(ticket.thumbUploadUrl, ticket.thumbUploadHeaders, preview.thumb).catch(() => undefined);
    }
    await putWithProgress(ticket.uploadUrl, ticket.uploadHeaders, input.file, onProgress);
    return await api<AcademyVideoDto>(`/academies/${academyId}/videos/${ticket.videoId}/complete`, {
      method: 'POST',
      body: preview.durationMs !== null ? { durationMs: preview.durationMs } : {},
    });
  } catch (e) {
    // Si se corta, borra el registro: si no, queda "subiendo" ocupando cupo y cada
    // reintento sumaba otro (así se juntaron 26 GB fantasma en una academia).
    await api(`/academies/${academyId}/videos/${ticket.videoId}`, { method: 'DELETE' }).catch(() => undefined);
    throw e;
  }
}

// --- llamadas a la API ----------------------------------------------------------

export const academiesApi = {
  list: (region?: ChileRegion | '') =>
    api<AcademySummaryDto[]>(`/academies${region ? `?region=${region}` : ''}`),
  mine: () => api<AcademySummaryDto[]>('/academies/mine'),
  get: (id: string) => api<AcademyDto>(`/academies/${id}`),
  create: (v: AcademyFormValues, logo: File | null, directorEmail?: string) => {
    const fd = new FormData();
    fd.append('data', JSON.stringify({ ...academyPayload(v), directorEmail: directorEmail?.trim() || null }));
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
  /** Nombra subdirector o vuelve profesor (solo el director). */
  setMemberRole: (id: string, userId: string, role: 'SUBDIRECTOR' | 'TEACHER') =>
    api<AcademyDto>(`/academies/${id}/members/${userId}`, { method: 'PATCH', body: { role } }),
  removeMember: (id: string, userId: string) =>
    api<AcademyDto>(`/academies/${id}/members/${userId}`, { method: 'DELETE' }),
  createClass: (id: string, v: ClassFormValues) =>
    api<AcademyClassDto>(`/academies/${id}/classes`, { method: 'POST', body: classPayload(v) }),
  updateClass: (id: string, classId: string, v: ClassFormValues) =>
    api<AcademyClassDto>(`/academies/${id}/classes/${classId}`, { method: 'PATCH', body: classPayload(v) }),
  removeClass: (id: string, classId: string) =>
    api<void>(`/academies/${id}/classes/${classId}`, { method: 'DELETE' }),
  // --- inscripción a clases ---
  enroll: (id: string, classId: string, message?: string) =>
    api<void>(`/academies/${id}/classes/${classId}/enroll`, { method: 'POST', body: { message: message?.trim() || null } }),
  unenroll: (id: string, classId: string) =>
    api<void>(`/academies/${id}/classes/${classId}/enroll`, { method: 'DELETE' }),
  enrollments: (id: string, status?: AcademyEnrollmentStatus) =>
    api<AcademyEnrollmentDto[]>(`/academies/${id}/enrollments${status ? `?status=${status}` : ''}`),
  acceptEnrollment: (id: string, eid: string) =>
    api<AcademyEnrollmentDto[]>(`/academies/${id}/enrollments/${eid}/accept`, { method: 'POST' }),
  rejectEnrollment: (id: string, eid: string) =>
    api<AcademyEnrollmentDto[]>(`/academies/${id}/enrollments/${eid}/reject`, { method: 'POST' }),
  removeEnrollment: (id: string, eid: string) =>
    api<AcademyEnrollmentDto[]>(`/academies/${id}/enrollments/${eid}`, { method: 'DELETE' }),
  myEnrollments: () => api<MyEnrollmentDto[]>('/academies/enrollments/mine'),
  videos: (id: string, classId?: string) =>
    api<AcademyVideoDto[]>(`/academies/${id}/videos${classId ? `?classId=${classId}` : ''}`),
  videoUrl: (id: string, videoId: string) => api<{ url: string }>(`/academies/${id}/videos/${videoId}/url`),
  /** Abre (o retoma) el chat privado con el director, con un primer mensaje sugerido. */
  contact: (id: string) =>
    api<{ conversationId: string; draft: string }>(`/academies/${id}/contact`, { method: 'POST' }),
  updateVideo: (
    id: string,
    videoId: string,
    body: {
      title?: string;
      classId?: string | null;
      style?: DanceStyle | null;
      recordedOn?: string | null;
      description?: string | null;
      featured?: boolean;
    },
  ) => api<AcademyVideoDto>(`/academies/${id}/videos/${videoId}`, { method: 'PATCH', body }),
  removeVideo: (id: string, videoId: string) =>
    api<void>(`/academies/${id}/videos/${videoId}`, { method: 'DELETE' }),
  /** De las huellas dadas, cuáles ya están (en la galería o en la bóveda). */
  duplicates: (id: string, hashes: string[]) =>
    api<{ hash: string; videoId: string; title: string; location: 'GALLERY' | 'VAULT' }[]>(`/academies/${id}/videos/duplicates`, {
      method: 'POST',
      body: { hashes },
    }),
  /** URL firmada que descarga el original con su nombre (dueño y profesores). */
  downloadUrl: (id: string, videoId: string, format: DownloadFormat = 'original') =>
    api<{ url: string }>(`/academies/${id}/videos/${videoId}/download${format === 'mp4' ? '?format=mp4' : ''}`),
  vault: (id: string) => api<AcademyVideoDto[]>(`/academies/${id}/vault`),
  toVault: (id: string, videoIds: string[]) =>
    api<{ moved: number }>(`/academies/${id}/vault`, { method: 'POST', body: { videoIds } }),
  fromVault: (id: string, videoIds: string[]) =>
    api<{ moved: number }>(`/academies/${id}/vault/restore`, { method: 'POST', body: { videoIds } }),
  getShare: (id: string, classId: string) => api<AcademyShareLinkDto | null>(`/academies/${id}/classes/${classId}/share`),
  createShare: (id: string, classId: string) =>
    api<AcademyShareLinkDto>(`/academies/${id}/classes/${classId}/share`, { method: 'POST' }),
  revokeShare: (id: string, classId: string) =>
    api<void>(`/academies/${id}/classes/${classId}/share`, { method: 'DELETE' }),
  reportVideo: (id: string, videoId: string, reason: string) =>
    api<void>(`/academies/${id}/videos/${videoId}/report`, { method: 'POST', body: { reason } }),
  reports: () => api<AcademyVideoReportDto[]>('/academies/reports'),
  /** Admin → Academias (SUPER_ADMIN): todas con su Plan Director y su uso. */
  adminPlans: () => api<AcademyAdminRowDto[]>('/academies/admin/plans'),
  setDirector: (id: string, email: string) =>
    api<AcademyAdminRowDto>(`/academies/${id}/director`, { method: 'PATCH', body: { email } }),
  setPlan: (id: string, body: { expiresAt?: string | null; storageQuotaGb?: number; vaultQuotaGb?: number }) =>
    api<AcademyAdminRowDto>(`/academies/${id}/plan`, { method: 'PATCH', body }),
  resolveReport: (reportId: string) => api<void>(`/academies/reports/${reportId}/resolve`, { method: 'POST' }),
};

// --- links compartidos (sin sesión) ---------------------------------------------------

/** Link público de una clase compartida. */
export function shareUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/v/${token}`;
}

export const sharedApi = {
  get: (token: string) => api<SharedClassDto>(`/share/${encodeURIComponent(token)}`),
  viewUrl: (token: string, videoId: string) =>
    api<{ url: string }>(`/share/${encodeURIComponent(token)}/media/${videoId}/url`),
  downloadUrl: (token: string, videoId: string, format: DownloadFormat = 'original') =>
    api<{ url: string }>(
      `/share/${encodeURIComponent(token)}/media/${videoId}/download${format === 'mp4' ? '?format=mp4' : ''}`,
    ),
};

// --- orden de la galería --------------------------------------------------------------

export const GALLERY_SORTS = [
  ['class-date', 'Fecha de la clase'],
  ['uploaded-desc', 'Subidos más recientes'],
  ['uploaded-asc', 'Subidos más antiguos'],
  ['duration-desc', 'Más largos primero'],
  ['duration-asc', 'Más cortos primero'],
] as const;
export type GallerySort = (typeof GALLERY_SORTS)[number][0];

/**
 * Ordena la galería (copia nueva). "Fecha de la clase" es el orden que ya trae la
 * API. En los órdenes por duración, las fotos (sin duración) van al final.
 */
export function sortGallery(items: readonly AcademyVideoDto[], sort: GallerySort): AcademyVideoDto[] {
  const list = [...items];
  const uploaded = (v: AcademyVideoDto) => Date.parse(v.createdAt);
  switch (sort) {
    case 'uploaded-desc':
      return list.sort((a, b) => uploaded(b) - uploaded(a));
    case 'uploaded-asc':
      return list.sort((a, b) => uploaded(a) - uploaded(b));
    case 'duration-desc':
    case 'duration-asc': {
      const dir = sort === 'duration-desc' ? -1 : 1;
      return list.sort((a, b) => {
        if (a.durationMs === null || b.durationMs === null) {
          return (a.durationMs === null ? 1 : 0) - (b.durationMs === null ? 1 : 0);
        }
        return dir * (a.durationMs - b.durationMs);
      });
    }
    default:
      return list;
  }
}

const SORT_KEY = 'nectason.academy.gallerySort';

export function loadGallerySort(): GallerySort {
  try {
    const v = window.localStorage.getItem(SORT_KEY);
    if (v && GALLERY_SORTS.some(([k]) => k === v)) return v as GallerySort;
  } catch {
    /* sin almacenamiento: orden por defecto */
  }
  return 'class-date';
}

export function saveGallerySort(sort: GallerySort): void {
  try {
    window.localStorage.setItem(SORT_KEY, sort);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

// --- Plan Director y permisos -----------------------------------------------------------

/** El dueño de la academia se muestra como "Director". */
export const MEMBER_ROLE_LABEL: Record<AcademyMemberRole, string> = {
  OWNER: 'Director',
  SUBDIRECTOR: 'Subdirector',
  TEACHER: 'Profesor',
};

/** Fecha del plan para mostrar (dd-mm-aaaa, hora de Chile). */
export function planDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
}

/** YYYY-MM-DD (hora de Chile) para un <input type="date">. */
export function planDateInput(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

/** Días que le quedan al plan (negativo = vencido). */
export function planDaysLeft(iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
}

/** Subir y mover archivos requiere el Plan Director vigente; el SUPER_ADMIN no depende del plan. */
export function canWrite(a: AcademyDto, superAdmin = false): boolean {
  return superAdmin || Boolean(a.plan?.active);
}

/**
 * El director (y el SUPER_ADMIN) elimina cualquier archivo; un profesor, solo lo
 * que subió él (la API lo valida igual).
 */
export function canDeleteMedia(a: AcademyDto, v: AcademyVideoDto, user: { id: string; role: string } | null): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN' || a.myRole === 'OWNER' || a.myRole === 'SUBDIRECTOR') return true;
  return a.myRole === 'TEACHER' && v.uploadedById === user.id;
}
