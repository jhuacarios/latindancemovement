import type { Track } from '@baile-latino/types';

/** URL de miniatura: usa coverUrl si existe; si no, la deriva del video de YouTube. */
export function trackThumbUrl(t: Track): string | null {
  // YouTube: mqdefault es 16:9 limpio (sin barras). Se prefiere sobre coverUrl,
  // que a veces es una miniatura 4:3 (con barras negras arriba/abajo).
  if (t.source === 'YOUTUBE') {
    return `https://i.ytimg.com/vi/${t.sourceId}/mqdefault.jpg`;
  }
  if (t.coverUrl) return t.coverUrl;
  return null;
}

/** Miniatura del video (16:9, llena el cuadro sin barras ni recorte raro).
 *  `widthClass` permite un tamaño distinto al default (ej: filas más delgadas). */
export function TrackThumb({
  track,
  widthClass = 'w-24',
}: {
  track: Track;
  widthClass?: string;
}) {
  const url = trackThumbUrl(track);
  if (!url) {
    return (
      <div
        className={`aspect-video ${widthClass} shrink-0 rounded bg-neutral-800`}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      className={`aspect-video ${widthClass} shrink-0 rounded bg-neutral-800 object-cover`}
    />
  );
}
