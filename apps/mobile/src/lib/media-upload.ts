import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { File, UploadTask, UploadType } from 'expo-file-system';
import {
  ACADEMY_PHOTO_MAX_BYTES,
  ACADEMY_PHOTO_MIME_TYPES,
  ACADEMY_VIDEO_MAX_BYTES,
  ACADEMY_VIDEO_MIME_TYPES,
  type AcademyVideoDto,
  type AcademyVideoUploadTicket,
} from '@baile-latino/types';
import { ApiError, api } from './api';

/**
 * Subida de fotos y videos a la galería de una academia, igual que la web:
 * huella SHA-256 (para saltar repetidos) → URL firmada → miniatura y archivo
 * directo al storage (desde el disco, sin cargarlo en memoria) → confirmar.
 */

/** Abre la galería del teléfono (varias fotos y videos a la vez). */
export async function pickMedia(): Promise<ImagePicker.ImagePickerAsset[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: 30,
    quality: 1,
    // El video original (HEVC del iPhone): la API genera la copia compatible.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  });
  return res.canceled ? [] : res.assets;
}

const VIDEO_MIME_BY_EXT: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

type Prepared = { uri: string; mimeType: string; kind: 'PHOTO' | 'VIDEO'; durationMs: number | null };

/** Fotos HEIC u otros formatos → JPEG; videos tal cual (si el formato sirve). */
async function prepare(asset: ImagePicker.ImagePickerAsset): Promise<Prepared> {
  if (asset.type === 'video') {
    const ext = (asset.fileName ?? asset.uri).split('.').pop()?.toLowerCase() ?? '';
    const mimeType = (ACADEMY_VIDEO_MIME_TYPES as readonly string[]).includes(asset.mimeType ?? '')
      ? asset.mimeType!
      : VIDEO_MIME_BY_EXT[ext];
    if (!mimeType) throw new ApiError(400, 'Formato de video no permitido. Usa MP4, MOV o WEBM.');
    return { uri: asset.uri, mimeType, kind: 'VIDEO', durationMs: asset.duration ? Math.round(asset.duration) : null };
  }
  if ((ACADEMY_PHOTO_MIME_TYPES as readonly string[]).includes(asset.mimeType ?? '')) {
    return { uri: asset.uri, mimeType: asset.mimeType!, kind: 'PHOTO', durationMs: null };
  }
  const ref = await ImageManipulator.manipulate(asset.uri).renderAsync();
  const out = await ref.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
  return { uri: out.uri, mimeType: 'image/jpeg', kind: 'PHOTO', durationMs: null };
}

/** Miniatura JPG (640 px de ancho); null si no se pudo (la API muestra un ícono). */
async function thumbnail(p: Prepared): Promise<string | null> {
  try {
    const src = p.kind === 'VIDEO' ? (await getThumbnailAsync(p.uri, { time: 1000, quality: 0.8 })).uri : p.uri;
    const ref = await ImageManipulator.manipulate(src).resize({ width: 640 }).renderAsync();
    return (await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG })).uri;
  } catch {
    return null;
  }
}

async function put(
  uri: string,
  url: string,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const task = new UploadTask(new File(uri), url, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers,
    onProgress: onProgress ? (d) => d.totalBytes > 0 && onProgress(d.bytesSent / d.totalBytes) : undefined,
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
}

/** Nombre a mostrar: el del archivo sin extensión (o "Foto"/"Video" + fecha). */
function titleOf(asset: ImagePicker.ImagePickerAsset): string {
  const base = asset.fileName?.replace(/\.[^.]+$/, '').trim();
  if (base && base.length >= 2) return base.slice(0, 160);
  const today = new Date().toLocaleDateString('es-CL');
  return `${asset.type === 'video' ? 'Video' : 'Foto'} ${today}`;
}

/** Inicio del mensaje de la API cuando el archivo ya está (ver academy-videos.service.ts). */
const DUPLICATE_PREFIX = 'Ya está en la galería:';
export const isDuplicateError = (e: unknown) =>
  e instanceof ApiError && e.status === 409 && e.message.startsWith(DUPLICATE_PREFIX);

export async function uploadAcademyMedia(
  academyId: string,
  asset: ImagePicker.ImagePickerAsset,
  classId: string | null,
  onProgress: (fraction: number) => void,
): Promise<AcademyVideoDto> {
  const p = await prepare(asset);
  const file = new File(p.uri);
  const size = file.size;
  const max = p.kind === 'PHOTO' ? ACADEMY_PHOTO_MAX_BYTES : ACADEMY_VIDEO_MAX_BYTES;
  if (size > max) throw new ApiError(400, p.kind === 'PHOTO' ? 'La foto no puede superar 25 MB.' : 'El video no puede superar 3 GB.');
  const contentHash = await file.digest('SHA-256').catch(() => undefined);
  const thumb = await thumbnail(p);
  const ticket = await api<AcademyVideoUploadTicket>(`/academies/${academyId}/videos`, {
    method: 'POST',
    body: { title: titleOf(asset), mimeType: p.mimeType, sizeBytes: size, classId, contentHash },
  });
  try {
    if (thumb) await put(thumb, ticket.thumbUploadUrl, ticket.thumbUploadHeaders).catch(() => undefined);
    await put(p.uri, ticket.uploadUrl, ticket.uploadHeaders, onProgress);
    return await api<AcademyVideoDto>(`/academies/${academyId}/videos/${ticket.videoId}/complete`, {
      method: 'POST',
      body: p.durationMs !== null ? { durationMs: p.durationMs } : {},
    });
  } catch (e) {
    // Si se corta, borra el registro para que no quede "subiendo" ocupando cupo.
    await api(`/academies/${academyId}/videos/${ticket.videoId}`, { method: 'DELETE' }).catch(() => undefined);
    throw e;
  }
}
