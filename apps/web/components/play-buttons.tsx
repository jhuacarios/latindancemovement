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
 * Botones de reproducir audio/video de una canción de YouTube. El botón de
 * audio es redondo y refleja el estado (▶/⏸): al clickearlo alterna entre
 * reproducir y detener. Si el video no permite reproducción fuera de YouTube
 * (`embeddable === false`), se muestran con una ✕ roja encima y deshabilitados.
 */
export function PlayButtons({ track }: { track: Track }) {
  const player = usePlayer();
  if (!player.canPlay(track)) return null;

  const blocked = player.isBlocked(track);
  const isPlaying = player.audioKey === `${track.source}:${track.sourceId}`;

  return (
    <>
      <button
        type="button"
        className={
          'relative flex h-7 w-7 items-center justify-center rounded-full text-xs transition disabled:cursor-not-allowed ' +
          (blocked
            ? 'bg-neutral-800'
            : isPlaying
              ? 'bg-brand text-white'
              : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700')
        }
        disabled={blocked}
        title={
          blocked ? BLOCKED_TITLE : isPlaying ? 'Detener' : 'Reproducir audio'
        }
        aria-label={isPlaying ? 'Detener' : 'Reproducir audio'}
        onClick={() => (isPlaying ? player.stopAudio() : player.playAudio(track))}
      >
        <span className={blocked ? 'opacity-30' : undefined}>
          {isPlaying ? '⏸' : '▶'}
        </span>
        {blocked && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-bold text-red-500">
            ✕
          </span>
        )}
      </button>
      <PlayBtn
        icon="🎬"
        label="Reproducir video"
        blocked={blocked}
        onClick={() => player.playVideo(track)}
      />
    </>
  );
}
