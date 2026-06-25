'use client';

import type { Track } from '@baile-latino/types';
import { usePlayer } from '@/components/player';

const BLOCKED_TITLE = 'Este video no permite reproducción fuera de YouTube';

function PlayBtn({
  icon,
  label,
  blocked,
  onClick,
}: {
  icon: string;
  label: string;
  blocked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="relative rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:hover:bg-neutral-800"
      disabled={blocked}
      title={blocked ? BLOCKED_TITLE : label}
      onClick={onClick}
    >
      <span className={blocked ? 'opacity-30' : undefined}>{icon}</span>
      {blocked && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-bold text-red-500">
          ✕
        </span>
      )}
    </button>
  );
}

/**
 * Botones de reproducir audio/video de una canción de YouTube. Si el video no
 * permite reproducción fuera de YouTube (`embeddable === false`), se muestran
 * con una ✕ roja encima y deshabilitados.
 */
export function PlayButtons({ track }: { track: Track }) {
  const player = usePlayer();
  if (!player.canPlay(track)) return null;

  const blocked = player.isBlocked(track);

  return (
    <>
      <PlayBtn
        icon="🎵"
        label="Reproducir audio"
        blocked={blocked}
        onClick={() => player.playAudio(track)}
      />
      <PlayBtn
        icon="🎬"
        label="Reproducir video"
        blocked={blocked}
        onClick={() => player.playVideo(track)}
      />
    </>
  );
}
