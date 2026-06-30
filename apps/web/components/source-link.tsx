'use client';

import type { Track } from '@baile-latino/types';

/** Botón-ícono que abre la canción en su fuente (YouTube o Spotify) en otra pestaña. */
export function SourceLink({ track }: { track: Track }) {
  const isSpotify = track.source === 'SPOTIFY';
  return (
    <a
      href={track.url}
      target="_blank"
      rel="noreferrer"
      title={isSpotify ? 'Abrir en Spotify' : 'Abrir en YouTube'}
      aria-label={isSpotify ? 'Abrir en Spotify' : 'Abrir en YouTube'}
      className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
    >
      {isSpotify ? (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="#1DB954"
            d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.16a.75.75 0 1 1-.33-1.46c4.5-1 8.4-.55 11.5 1.37.35.22.46.69.23 1zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.2-2-8.1-2.55-11.9-1.4a.94.94 0 1 1-.54-1.8c4.3-1.3 9.7-.7 13.4 1.6.44.27.58.85.33 1.29zm.13-3.4C15.36 8.2 8.78 7.98 5.02 9.12a1.13 1.13 0 1 1-.65-2.16C8.7 5.65 16 5.9 20.3 8.46a1.13 1.13 0 0 1-1.17 1.93z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="#FF0000"
            d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8z"
          />
          <path fill="#fff" d="M9.6 15.6V8.4l6.2 3.6z" />
        </svg>
      )}
    </a>
  );
}
