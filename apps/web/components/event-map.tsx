'use client';

import type { EventDto } from '@baile-latino/types';
import { mapsEmbedUrl, mapsSearchLink } from '@/lib/maps';

const placeOf = (ev: EventDto) => ({
  place: ev.venueName,
  address: ev.address,
  city: ev.city,
  region: ev.region,
});

export function eventMapsLink(ev: EventDto): string | null {
  return mapsSearchLink(placeOf(ev));
}

/** Mapa embebido de Google Maps (sin API key) con la ubicación del evento. */
export function EventMap({ ev }: { ev: EventDto }) {
  const src = mapsEmbedUrl(placeOf(ev));
  if (!src) return null;
  return (
    <iframe
      title={`Mapa: ${ev.venueName ?? ev.address}`}
      src={src}
      className="h-64 w-full rounded-lg border-0 bg-neutral-800"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}
