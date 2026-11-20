import type { EventDto, EventsByRegionResponse } from '@baile-latino/types';
import { regionName } from '@baile-latino/types';
import { API_BASE, api } from './api';

export const eventsApi = {
  /** Eventos por región, de norte a sur. Por defecto solo los próximos. */
  list: (includePast: boolean) => api<EventsByRegionResponse>(`/events?includePast=${includePast}`),
  get: (id: string) => api<EventDto>(`/events/${id}`),
};

/** Flyer (público). `?v=` para refrescarlo cuando lo cambian. */
export function flyerUrl(ev: Pick<EventDto, 'id' | 'hasFlyer' | 'updatedAt'>): string | null {
  return ev.hasFlyer ? `${API_BASE}/events/${ev.id}/flyer?v=${encodeURIComponent(ev.updatedAt)}` : null;
}

// --- fechas (hora de Chile) -------------------------------------------------------
const TZ = 'America/Santiago';

export function formatEventTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

/** "vie 13 sep · 22:00". */
export function formatEventDate(iso: string): string {
  const day = new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(iso))
    .replace(/\./g, '');
  return `${day} · ${formatEventTime(iso)}`;
}

/** "viernes 13 de septiembre de 2026". */
export function formatEventDateLong(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Link de Google Maps con la dirección (o el lugar), como en la web. null si no hay dónde. */
export function eventMapsLink(
  ev: Pick<EventDto, 'venueName' | 'address' | 'city' | 'commune' | 'region'>,
): string | null {
  const main = ev.address || ev.venueName;
  if (!main) return null;
  const q = [ev.address ? ev.venueName : null, main, ev.commune || ev.city, regionName(ev.region), 'Chile']
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Bachata / Salsa sin repetir (los estilos vienen con su variante). */
export function styleFamilies(styles: string[]): string[] {
  return [...new Set(styles.map((s) => (s.startsWith('BACHATA') ? 'BACHATA' : 'SALSA')))];
}

export function instagramProfileUrl(handle: string): string {
  return `https://instagram.com/${handle.replace(/^@/, '')}`;
}
