import { clsx } from './clsx';

/** Logo de Instagram (contorno): cámara con lente y punto. Hereda el color y tamaño. */
export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? 'h-4 w-4'}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Chip llamativo que lleva al perfil de Instagram: ícono + @cuenta, en rosado
 * tipo Instagram para que se distinga de los badges de estilo.
 */
export function InstagramLink({
  handle,
  size = 'md',
  className,
}: {
  /** Sin @. */
  handle: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <a
      href={`https://instagram.com/${handle}`}
      target="_blank"
      rel="noreferrer"
      title={`Abrir @${handle} en Instagram`}
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border border-pink-500/50 bg-pink-500/10 font-semibold text-pink-300',
        'transition hover:border-pink-400 hover:bg-pink-500/20 hover:text-pink-200',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <InstagramIcon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      @{handle}
    </a>
  );
}
