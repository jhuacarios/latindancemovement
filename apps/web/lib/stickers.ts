import { stickerPath, type StickerPackDto, type StickerPackScope } from '@baile-latino/types';
import { api, API_BASE, uploadForm } from './api';

export type StickerOwner = { scope: StickerPackScope; academyId?: string; placeId?: string };

export const stickerKeys = {
  available: ['stickers', 'available'] as const,
  owner: (o: StickerOwner) => ['stickers', 'owner', o.scope, o.academyId ?? o.placeId ?? ''] as const,
};

export function stickerUrl(id: string): string {
  return `${API_BASE}${stickerPath(id)}`;
}

function ownerQuery(o: StickerOwner): string {
  const q = new URLSearchParams({ scope: o.scope });
  if (o.academyId) q.set('academyId', o.academyId);
  if (o.placeId) q.set('placeId', o.placeId);
  return q.toString();
}

export const stickersApi = {
  /** Los packs que puedo usar en el chat. */
  available: () => api<StickerPackDto[]>('/stickers/packs'),
  /** Packs de un dueño, para administrarlos. */
  ofOwner: (o: StickerOwner) => api<StickerPackDto[]>(`/stickers/packs/manage?${ownerQuery(o)}`),
  createPack: (o: StickerOwner, name: string) =>
    api<StickerPackDto>('/stickers/packs', { method: 'POST', body: { ...o, name } }),
  renamePack: (id: string, name: string) =>
    api<StickerPackDto>(`/stickers/packs/${id}`, { method: 'PATCH', body: { name } }),
  removePack: (id: string) => api<void>(`/stickers/packs/${id}`, { method: 'DELETE' }),
  addSticker: (packId: string, file: Blob, name: string) => {
    const fd = new FormData();
    fd.append('file', file, name);
    return uploadForm<StickerPackDto>(`/stickers/packs/${packId}/stickers`, fd);
  },
  removeSticker: (id: string) => api<StickerPackDto>(`/stickers/${id}`, { method: 'DELETE' }),
};

/**
 * Prepara la imagen de un sticker: máx. 320 px, PNG (conserva la transparencia).
 * Los GIF se suben tal cual (para no perder la animación).
 */
export function prepareSticker(file: File, size = 320): Promise<{ blob: Blob; name: string }> {
  if (file.type === 'image/gif') return Promise.resolve({ blob: file, name: file.name });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (b) => (b ? resolve({ blob: b, name: 'sticker.png' }) : reject(new Error('blob'))),
        'image/png',
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('img'));
    };
    img.src = url;
  });
}
