/**
 * Logo de YouTube: rectángulo redondeado en el color actual (usar con
 * text-[#FF0000]) y la flecha de play en blanco. Hereda el tamaño por className.
 */
export function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className ?? 'h-4 w-4'}
    >
      <path d="M23.5 6.2a3 3 0 0 0-2.11-2.12C19.51 3.55 12 3.55 12 3.55s-7.51 0-9.39.53A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.11 2.12c1.88.53 9.39.53 9.39.53s7.51 0 9.39-.53a3 3 0 0 0 2.11-2.12A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8z" />
      <path fill="#fff" d="M9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
    </svg>
  );
}
