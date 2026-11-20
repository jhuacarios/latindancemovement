import { stickerPath, type StickerPackDto } from '@baile-latino/types';
import { API_BASE, api } from './api';

export const stickersApi = {
  /** Los packs que puedo usar en el chat (Nectason + mis academias + mis sociales). */
  available: () => api<StickerPackDto[]>('/stickers/packs'),
  /** Quita un sticker (solo los de "Mis stickers", o de un pack que administro). */
  remove: (id: string) => api<StickerPackDto>(`/stickers/${id}`, { method: 'DELETE' }),
};

/** Imagen pública del sticker (no cambia: se cachea). */
export function stickerUrl(id: string): string {
  return `${API_BASE}${stickerPath(id)}`;
}
