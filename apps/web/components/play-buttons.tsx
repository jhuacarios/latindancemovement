'use client';

import type { Track } from '@baile-latino/types';
import { usePlayer } from '@/components/player';

/**
 * Botones de reproducir audio/video de una canción de YouTube. Si el video no
 * permite reproducción externa (`embeddable === false`), se muestran
 * deshabilitados en vez de ocultarse.
 */
export function PlayButtons({ track }: { track: Track }) {
  const player = usePlayer();
  if (!player.canPlay(track)) return null;

  const blocked = track.details?.embeddable === false;
  const cls =
    'rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700 ' +
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-800';
  const blockedTitle = 'Este video no permite reproducción externa';

  return (
    <>
      <button
        className={cls}
        disabled={blocked}
        title={blocked ? blockedTitle : 'Reproducir audio'}
        onClick={() => player.playAudio(track)}
      >
        🎵
      </button>
      <button
        className={cls}
        disabled={blocked}
        title={blocked ? blockedTitle : 'Reproducir video'}
        onClick={() => player.playVideo(track)}
      >
        🎬
      </button>
    </>
  );
}
