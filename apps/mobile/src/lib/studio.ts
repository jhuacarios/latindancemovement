import { File, UploadTask, UploadType } from 'expo-file-system';
import type * as DocumentPicker from 'expo-document-picker';
import {
  STUDIO_AUDIO_MIME_TYPES,
  type AudioFileSummary,
  type DanceStyle,
  type SeparationMode,
  type SongStudy,
  type StemUrls,
  type StudioUploadTicket,
} from '@baile-latino/types';
import { ApiError, api } from './api';

/**
 * Estudio (Analizador de bachata y salsa), igual que la web: el audio del usuario
 * es privado y va directo al storage con una URL firmada.
 */

export const STUDIO_MAX_UPLOAD_MB = 30;

/** Estados en los que el audio sigue en proceso (la lista se refresca sola). */
export const IN_PROGRESS = new Set(['QUEUED', 'PROCESSING']);
/** Estados en los que la separación (instrumentos o pistas) sigue en curso. */
export const SEPARATION_IN_PROGRESS = new Set(['PENDING', 'PROCESSING']);

export const STUDIO_STYLES: { style: DanceStyle; label: string }[] = [
  { style: 'BACHATA', label: 'Bachata' },
  { style: 'SALSA', label: 'Salsa' },
];

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

/** El picker a veces no informa el tipo (o informa uno raro): se deduce de la extensión. */
export function audioMimeType(asset: Pick<DocumentPicker.DocumentPickerAsset, 'mimeType' | 'name'>): string | null {
  const allowed = STUDIO_AUDIO_MIME_TYPES as readonly string[];
  if (asset.mimeType && allowed.includes(asset.mimeType)) return asset.mimeType;
  const ext = asset.name.split('.').pop()?.toLowerCase();
  return ext ? (MIME_BY_EXT[ext] ?? null) : null;
}

/** Sube un audio: pide la URL firmada, lo sube desde el disco al storage y encola el análisis. */
export async function uploadAudio(
  asset: DocumentPicker.DocumentPickerAsset,
  style: DanceStyle,
  onProgress: (fraction: number) => void,
): Promise<AudioFileSummary> {
  const mimeType = audioMimeType(asset);
  if (!mimeType) throw new ApiError(400, 'Formato no permitido. Usa MP3, M4A, WAV o FLAC.');
  const file = new File(asset.uri);
  const sizeBytes = asset.size ?? file.size ?? 0;
  if (sizeBytes > STUDIO_MAX_UPLOAD_MB * 1024 * 1024) {
    throw new ApiError(400, `El archivo no puede superar ${STUDIO_MAX_UPLOAD_MB} MB.`);
  }
  const ticket = await api<StudioUploadTicket>('/studio/uploads', {
    method: 'POST',
    body: { fileName: asset.name, mimeType, sizeBytes, rightsAccepted: true, style },
  });
  const task = new UploadTask(file, ticket.uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: ticket.uploadHeaders,
    onProgress: (d) => d.totalBytes > 0 && onProgress(d.bytesSent / d.totalBytes),
  });
  try {
    const res = await task.uploadAsync();
    if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, 'No se pudo subir el archivo.');
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'Se cortó la conexión al subir el archivo.');
  } finally {
    task.release();
  }
  return api<AudioFileSummary>(`/studio/audio-files/${ticket.audioFileId}/complete`, { method: 'POST' });
}

export const studioApi = {
  list: (style: DanceStyle) => api<AudioFileSummary[]>(`/studio/audio-files?style=${style}`),
  get: (id: string) => api<SongStudy>(`/studio/audio-files/${id}`),
  playbackUrl: (id: string) => api<{ url: string }>(`/studio/audio-files/${id}/url`),
  setFirstBeat: (id: string, timeMs: number | null) =>
    api<SongStudy>(`/studio/audio-files/${id}/first-beat`, { method: 'PATCH', body: { timeMs } }),
  reanalyze: (id: string) => api<AudioFileSummary>(`/studio/audio-files/${id}/reanalyze`, { method: 'POST' }),
  requestStems: (id: string, mode: SeparationMode) =>
    api<SongStudy>(`/studio/audio-files/${id}/stems`, { method: 'POST', body: { mode } }),
  stemUrls: (id: string) => api<StemUrls>(`/studio/audio-files/${id}/stems`),
  remove: (id: string) => api<{ id: string }>(`/studio/audio-files/${id}`, { method: 'DELETE' }),
};

/** 3:25 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Índice del último valor <= ms en una lista ordenada (-1 si ninguno). */
export function indexAt(sortedMs: number[], ms: number): number {
  let lo = 0;
  let hi = sortedMs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedMs[mid] <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
