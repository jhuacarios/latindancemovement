import type { TrackSource } from '@baile-latino/types';

/** Reconstruye la URL canónica de un track a partir de su fuente + id. */
export function buildTrackUrl(source: TrackSource, sourceId: string): string {
  switch (source) {
    case 'SPOTIFY':
      return `https://open.spotify.com/track/${sourceId}`;
    case 'YOUTUBE':
      return `https://www.youtube.com/watch?v=${sourceId}`;
    default:
      return sourceId;
  }
}

export interface ParsedLink {
  source: TrackSource;
  sourceId: string;
}

/**
 * Intenta extraer (source, sourceId) desde un link pegado de Spotify o YouTube.
 * Soporta los formatos más comunes. Devuelve null si no reconoce el link.
 */
export function parseTrackLink(raw: string): ParsedLink | null {
  const link = raw.trim();

  // Spotify: open.spotify.com/track/<id> | spotify:track:<id>
  const spotifyUrl = link.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/);
  if (spotifyUrl) return { source: 'SPOTIFY', sourceId: spotifyUrl[1] };
  const spotifyUri = link.match(/^spotify:track:([A-Za-z0-9]+)$/);
  if (spotifyUri) return { source: 'SPOTIFY', sourceId: spotifyUri[1] };

  // YouTube: youtu.be/<id> | youtube.com/watch?v=<id> | /shorts/<id> | /embed/<id>
  const ytShort = link.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (ytShort) return { source: 'YOUTUBE', sourceId: ytShort[1] };
  const ytWatch = link.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (ytWatch) return { source: 'YOUTUBE', sourceId: ytWatch[1] };
  const ytPath = link.match(/youtube\.com\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/);
  if (ytPath) return { source: 'YOUTUBE', sourceId: ytPath[1] };

  return null;
}
