import type {
  AcademyVideoDto,
  PlaceMediaDto,
  PlaceMediaListDto,
  PlaceMediaStorage,
  PlaceMediaUploadTicket,
} from '@baile-latino/types';
import { api } from './api';
import { isPhotoMime, mediaMimeType, photoThumb, putWithProgress, videoPreview } from './academies';

const base = (placeId: string) => `/community/places/${placeId}/media`;

export const placeMediaApi = {
  list: (placeId: string) => api<PlaceMediaListDto>(base(placeId)),
  vault: (placeId: string) => api<PlaceMediaDto[]>(`${base(placeId)}/vault`),
  duplicates: (placeId: string, hashes: string[]) =>
    api<{ hash: string; mediaId: string; title: string; location: 'GALLERY' | 'VAULT' }[]>(
      `${base(placeId)}/duplicates`,
      { method: 'POST', body: { hashes } },
    ),
  url: (placeId: string, mediaId: string) => api<{ url: string }>(`${base(placeId)}/${mediaId}/url`),
  downloadUrl: (placeId: string, mediaId: string) =>
    api<{ url: string }>(`${base(placeId)}/${mediaId}/download`),
  move: (placeId: string, mediaId: string, to: 'GALLERY' | 'VAULT') =>
    api<PlaceMediaDto>(`${base(placeId)}/${mediaId}/move`, { method: 'POST', body: { to } }),
  remove: (placeId: string, mediaId: string) =>
    api<void>(`${base(placeId)}/${mediaId}`, { method: 'DELETE' }),
  setQuota: (placeId: string, dto: { mediaGb?: number; vaultGb?: number }) =>
    api<PlaceMediaStorage>(`${base(placeId)}/quota`, { method: 'PATCH', body: dto }),
};

/** Descarga con el nombre original (el navegador sigue la URL firmada). */
export async function downloadPlaceMedia(placeId: string, mediaId: string): Promise<void> {
  const { url } = await placeMediaApi.downloadUrl(placeId, mediaId);
  window.location.href = url;
}

/**
 * Sube una foto o video del social: pide URLs firmadas, sube miniatura y archivo
 * directo al storage y lo confirma. Si algo falla, borra el registro (libera cupo).
 */
export async function uploadPlaceMedia(
  placeId: string,
  input: { file: File; title: string; recordedOn: string | null; contentHash?: string },
  onProgress: (fraction: number) => void,
): Promise<PlaceMediaDto> {
  const mimeType = mediaMimeType(input.file);
  if (!mimeType) throw new Error('Formato no permitido. Usa MP4, MOV o WEBM (video) o JPG, PNG o WEBP (foto).');
  const preview = isPhotoMime(mimeType)
    ? { durationMs: null, thumb: await photoThumb(input.file) }
    : await videoPreview(input.file);
  const t = await api<PlaceMediaUploadTicket>(base(placeId), {
    method: 'POST',
    body: {
      title: input.title,
      mimeType,
      sizeBytes: input.file.size,
      recordedOn: input.recordedOn,
      contentHash: input.contentHash,
    },
  });
  try {
    if (preview.thumb) {
      await putWithProgress(t.thumbUploadUrl, t.thumbUploadHeaders, preview.thumb).catch(() => undefined);
    }
    await putWithProgress(t.uploadUrl, t.uploadHeaders, input.file, onProgress);
    return await api<PlaceMediaDto>(`${base(placeId)}/${t.mediaId}/complete`, {
      method: 'POST',
      body: preview.durationMs !== null ? { durationMs: preview.durationMs } : {},
    });
  } catch (e) {
    await placeMediaApi.remove(placeId, t.mediaId).catch(() => undefined);
    throw e;
  }
}

/**
 * Adapta un archivo del social al formato que usa el reproductor de las academias
 * (mismos campos de media; sin clase, estilo ni copia MP4).
 */
export function asPlayerItem(m: PlaceMediaDto): AcademyVideoDto {
  return {
    id: m.id,
    academyId: m.placeId,
    kind: m.kind,
    location: m.location,
    vaultedAt: null,
    compat: { status: null, sizeBytes: null },
    classId: null,
    classTitle: null,
    featured: false,
    title: m.title,
    description: m.description,
    style: null,
    recordedOn: m.recordedOn,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    durationMs: m.durationMs,
    thumbUrl: m.thumbUrl,
    uploadedById: '',
    uploadedByName: m.uploadedByName,
    createdAt: m.createdAt,
  };
}
