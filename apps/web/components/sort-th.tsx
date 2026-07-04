'use client';

import { clsx } from './clsx';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  by: string;
  dir: SortDir;
}

/**
 * Alterna el orden de una columna. El primer click aplica la dirección
 * "primaria" (la que la flecha ▼ representa para esa columna); el siguiente
 * la invierte.
 */
export function nextSort(
  prev: SortState,
  col: string,
  primary: SortDir,
): SortState {
  if (prev.by !== col) return { by: col, dir: primary };
  return { by: col, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
}

/**
 * Encabezado de columna ordenable. La flecha ▼ indica el orden "primario"
 * de la columna (texto: A→Z; año: del más nuevo hacia atrás); ▲ el inverso.
 */
export function SortTh({
  label,
  col,
  primary,
  sort,
  onSort,
  className,
}: {
  label: string;
  col: string;
  /** Dirección que representa la flecha ▼ para esta columna. */
  primary: SortDir;
  sort: SortState;
  onSort: (col: string, primary: SortDir) => void;
  className?: string;
}) {
  const active = sort.by === col;
  const icon = active ? (sort.dir === primary ? '▼' : '▲') : '↕';
  return (
    <th
      className={clsx(
        'cursor-pointer select-none px-4 py-2 hover:text-neutral-200',
        className,
      )}
      onClick={() => onSort(col, primary)}
      title="Ordenar"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={clsx('text-xs', active ? 'text-brand' : 'text-neutral-600')}>
          {icon}
        </span>
      </span>
    </th>
  );
}
