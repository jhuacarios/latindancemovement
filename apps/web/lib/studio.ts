import type { AudioFileSummary, DanceStyle, SongStudy, StemUrls, StudioUploadTicket } from '@baile-latino/types';
import { STUDIO_AUDIO_MIME_TYPES } from '@baile-latino/types';
import { api, ApiError } from './api';

export const STUDIO_MAX_UPLOAD_MB = 30;

/** Estados en los que el audio sigue en proceso (la lista se refresca sola). */
export const IN_PROGRESS = new Set(['QUEUED', 'PROCESSING']);

/** Estados en los que la detección de instrumentos sigue en curso. */
export const INSTRUMENTS_IN_PROGRESS = new Set(['PENDING', 'PROCESSING']);

/** Algunos navegadores no informan el tipo (o informan uno raro): se deduce de la extensión. */
export function audioMimeType(file: File): string | null {
  const allowed = STUDIO_AUDIO_MIME_TYPES as readonly string[];
  if (allowed.includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    flac: 'audio/flac',
  };
  return ext ? (byExt[ext] ?? null) : null;
}

/** PUT directo al storage con progreso (fetch no informa progreso de subida). */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, 'No se pudo subir el archivo.'));
    xhr.onerror = () => reject(new ApiError(0, 'Se cortó la conexión al subir el archivo.'));
    xhr.send(file);
  });
}

/** Sube un audio: pide la URL firmada, lo sube directo al storage y encola el análisis. */
export async function uploadAudio(
  file: File,
  rightsAccepted: boolean,
  style: DanceStyle,
  onProgress: (fraction: number) => void,
): Promise<AudioFileSummary> {
  const mimeType = audioMimeType(file);
  if (!mimeType) throw new ApiError(400, 'Formato no permitido. Usa MP3, M4A, WAV o FLAC.');
  const ticket = await api<StudioUploadTicket>('/studio/uploads', {
    method: 'POST',
    body: { fileName: file.name, mimeType, sizeBytes: file.size, rightsAccepted, style },
  });
  await putWithProgress(ticket.uploadUrl, ticket.uploadHeaders, file, onProgress);
  return api<AudioFileSummary>(`/studio/audio-files/${ticket.audioFileId}/complete`, {
    method: 'POST',
  });
}

export const studioApi = {
  list: (style: DanceStyle) => api<AudioFileSummary[]>(`/studio/audio-files?style=${style}`),
  get: (id: string) => api<SongStudy>(`/studio/audio-files/${id}`),
  playbackUrl: (id: string) => api<{ url: string }>(`/studio/audio-files/${id}/url`),
  setFirstBeat: (id: string, timeMs: number | null) =>
    api<SongStudy>(`/studio/audio-files/${id}/first-beat`, {
      method: 'PATCH',
      body: { timeMs },
    }),
  reanalyze: (id: string) =>
    api<AudioFileSummary>(`/studio/audio-files/${id}/reanalyze`, { method: 'POST' }),
  requestStems: (id: string) => api<SongStudy>(`/studio/audio-files/${id}/stems`, { method: 'POST' }),
  stemUrls: (id: string) => api<StemUrls>(`/studio/audio-files/${id}/stems`),
  remove: (id: string) => api<{ id: string }>(`/studio/audio-files/${id}`, { method: 'DELETE' }),
};

/** 3:25 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
