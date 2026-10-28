import { regionName } from '@baile-latino/types';

export interface MapPlace {
  /** Nombre del lugar (bar, playa, parque…). */
  place?: string | null;
  address?: string | null;
  city?: string | null;
  region: string;
}

/**
 * Texto con el que Google Maps ubica un lugar: dirección si hay; si no, el
 * nombre del lugar. Siempre con ciudad/región y "Chile" para desambiguar.
 */
export function mapQuery(p: MapPlace): string | null {
  const main = p.address || p.place;
  if (!main) return null;
  return [p.address ? p.place : null, main, p.city, regionName(p.region), 'Chile']
    .filter(Boolean)
    .join(', ');
}

/** Link para abrir el lugar en Google Maps (en móvil abre la app). */
export function mapsSearchLink(p: MapPlace): string | null {
  const q = mapQuery(p);
  return q
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
    : null;
}

/** URL para un <iframe> con el mapa embebido (sin API key). */
export function mapsEmbedUrl(p: MapPlace): string | null {
  const q = mapQuery(p);
  return q
    ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&hl=es&output=embed`
    : null;
}
