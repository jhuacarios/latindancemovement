import type { Track } from '@baile-latino/types';

/** URL de miniatura: usa coverUrl si existe; si no, la deriva del video de YouTube. */
export function trackThumbUrl(t: Track): string | null {
  if (t.coverUrl) return t.coverUrl;
  if (t.source === 'YOUTUBE') {
    return `https://i.ytimg.com/vi/${t.sourceId}/mqdefault.jpg`;
  }
  return null;
}

/** Miniatura pequeña (16:9) del video de una canción. */
export function TrackThumb({ track }: { track: Track }) {
  const url = trackThumbUrl(track);
  if (!url) {
    return <div className="h-14 w-24 shrink-0 rounded bg-neutral-800" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      className="h-14 w-24 shrink-0 rounded bg-neutral-800 object-cover"
    />
  );
}
