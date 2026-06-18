'use client';

import type { Track } from '@baile-latino/types';

/** Botón-ícono que abre la canción en su fuente (YouTube) en otra pestaña. */
export function SourceLink({ track }: { track: Track }) {
  return (
    <a
      href={track.url}
      target="_blank"
      rel="noreferrer"
      title="Abrir en YouTube"
      aria-label="Abrir en YouTube"
      className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="#FF0000"
          d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8z"
        />
        <path fill="#fff" d="M9.6 15.6V8.4l6.2 3.6z" />
      </svg>
    </a>
  );
}
