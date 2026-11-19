import type {
  CommunityDto,
  CommunityPlaceDto,
  CommunityPlacesByRegionResponse,
  PlaceMediaListDto,
} from '@baile-latino/types';
import { API_BASE, api } from './api';

const base = (id: string) => `/community/places/${id}`;

export const placesApi = {
  /** Sociales al aire libre por región (solo activos). */
  outdoor: () => api<CommunityPlacesByRegionResponse>('/community/places?kind=OUTDOOR_SOCIAL'),
  get: (id: string) => api<CommunityPlaceDto>(base(id)),
  // comunidad
  community: (id: string) => api<CommunityDto>(`${base(id)}/community`),
  join: (id: string) => api<CommunityDto>(`${base(id)}/community/join`, { method: 'POST' }),
  leave: (id: string) => api<CommunityDto>(`${base(id)}/community/leave`, { method: 'POST' }),
  joinChannel: (id: string, channelId: string) =>
    api<CommunityDto>(`${base(id)}/community/channels/${channelId}/join`, { method: 'POST' }),
  leaveChannel: (id: string, channelId: string) =>
    api<CommunityDto>(`${base(id)}/community/channels/${channelId}/leave`, { method: 'POST' }),
  // fotos y videos (solo miembros)
  media: (id: string) => api<PlaceMediaListDto>(`${base(id)}/media`),
  mediaUrl: (id: string, mediaId: string) => api<{ url: string }>(`${base(id)}/media/${mediaId}/url`),
};

/** Foto principal (pública). `?v=` para refrescarla cuando cambia. */
export function placePhotoUrl(p: Pick<CommunityPlaceDto, 'id' | 'hasPhoto' | 'updatedAt'>): string | null {
  return p.hasPhoto ? `${API_BASE}/community/places/${p.id}/photo?v=${encodeURIComponent(p.updatedAt)}` : null;
}

export function galleryPhotoUrl(placeId: string, photoId: string): string {
  return `${API_BASE}/community/places/${placeId}/gallery/${photoId}`;
}

/** Link para abrir el punto en Google Maps (en el teléfono abre la app). */
export function mapsLink(p: Pick<CommunityPlaceDto, 'lat' | 'lng' | 'place' | 'name' | 'commune' | 'city'>): string {
  const q =
    p.lat != null && p.lng != null
      ? `${p.lat},${p.lng}`
      : [p.place ?? p.name, p.commune ?? p.city, 'Chile'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** "70% bachata · 30% salsa". */
export function mixLabel(pct: number): string {
  if (pct >= 100) return 'Solo bachata';
  if (pct <= 0) return 'Solo salsa';
  return `${pct}% bachata · ${100 - pct}% salsa`;
}
