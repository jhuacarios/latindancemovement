/** Logo de Spotify (verde). Hereda el tamaño por className. */
export function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="#1DB954"
      aria-hidden="true"
      className={className ?? 'h-4 w-4'}
    >
      <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.16a.75.75 0 1 1-.33-1.46c4.5-1 8.4-.55 11.5 1.37.35.22.46.69.23 1zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.2-2-8.1-2.55-11.9-1.4a.94.94 0 1 1-.54-1.8c4.3-1.3 9.7-.7 13.4 1.6.44.27.58.85.33 1.29zm.13-3.4C15.36 8.2 8.78 7.98 5.02 9.12a1.13 1.13 0 1 1-.65-2.16C8.7 5.65 16 5.9 20.3 8.46a1.13 1.13 0 0 1-1.17 1.93z" />
    </svg>
  );
}
