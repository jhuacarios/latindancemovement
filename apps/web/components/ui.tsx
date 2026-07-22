'use client';

import { clsx } from './clsx';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  const variants = {
    primary: 'bg-brand hover:bg-brand-dark text-white disabled:opacity-50',
    ghost: 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  } as const;
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  } as const;
  return (
    <button
      className={clsx(
        'rounded-lg font-medium transition disabled:cursor-not-allowed',
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm',
        'placeholder:text-neutral-500 focus:border-brand focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm',
        'focus:border-brand focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  // `clsx` solo concatena: no resuelve conflictos de Tailwind. Como `p-0` y `p-5`
  // tienen la misma especificidad, ganaba la que el CSS emitiera última (`p-5`),
  // así que un `<Card className="p-0">` seguía con padding. Si quien lo usa ya
  // define su propio `p-*`, no agregamos el nuestro. (`px-*`/`py-*` no cuentan:
  // ésos sí ganan por el orden de Tailwind y se usan para ajustar un solo eje.)
  const overridesPadding = /(^|\s)p-\S/.test(className ?? '');
  return (
    <div
      className={clsx(
        'rounded-xl border border-neutral-800 bg-neutral-900/60',
        !overridesPadding && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StyleBadge({
  style,
  compact = false,
}: {
  style: string;
  /** Muestra solo "B"/"S" (para espacios angostos, ej. el panel de playlist). */
  compact?: boolean;
}) {
  const isBachata = style.startsWith('BACHATA') || style === 'BACHATA';
  return (
    <span
      title={compact ? style : undefined}
      className={clsx(
        'inline-block rounded-full font-semibold',
        compact
          ? 'h-5 w-5 text-center text-xs leading-5'
          : 'px-2 py-0.5 text-xs',
        isBachata
          ? 'bg-amber-500/15 text-amber-300'
          : 'bg-red-500/15 text-red-300',
      )}
    >
      {compact ? (isBachata ? 'B' : 'S') : style}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-600 border-t-brand" />
      {label ?? 'Cargando…'}
    </div>
  );
}
