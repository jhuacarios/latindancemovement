'use client';

import { clsx } from './clsx';

const OPTIONS: { value: string; label: string; active: string }[] = [
  { value: '', label: 'Todos', active: 'bg-brand text-white' },
  { value: 'BACHATA', label: 'Bachata', active: 'bg-amber-500 text-black' },
  { value: 'SALSA', label: 'Salsa', active: 'bg-red-500 text-white' },
];

/** Switch segmentado para filtrar por estilo (Todos / Bachata / Salsa). */
export function StyleFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition lg:px-5 lg:py-2 lg:text-sm',
            value === o.value ? o.active : 'text-neutral-300 hover:bg-neutral-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
