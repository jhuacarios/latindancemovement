'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DanceStyle, Tag } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Select } from './ui';
import { clsx } from './clsx';

/** Máximo de sub-estilos por estilo (bachata y salsa: 4). */
const maxFor = (style: string) =>
  style === 'SALSA' || style === 'BACHATA' ? 4 : 3;

/** Dropdown de filtro por sub-estilo, poblado desde el vocabulario (por estilo). */
export function SubstyleFilterSelect({
  style,
  value,
  onChange,
}: {
  style: DanceStyle;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: vocab } = useQuery({
    queryKey: ['tags-vocab'],
    queryFn: () => api<Tag[]>('/music/tags'),
    // El vocabulario de sub-estilos casi no cambia: se cachea para que el modal
    // no lo vuelva a pedir cada vez que se abre.
    staleTime: 5 * 60 * 1000,
  });
  const names = (vocab ?? [])
    .filter((t) => t.style === style)
    .map((t) => t.name);

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todos</option>
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </Select>
  );
}

/**
 * Filtro por sub-estilo con selección múltiple (dropdown con checkboxes).
 * Muestra solo los sub-estilos del estilo elegido. Vacío = todos.
 */
export function SubstyleFilterMultiSelect({
  style,
  value,
  onChange,
}: {
  style: DanceStyle;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: vocab } = useQuery({
    queryKey: ['tags-vocab'],
    queryFn: () => api<Tag[]>('/music/tags'),
    // El vocabulario de sub-estilos casi no cambia: se cachea para que el modal
    // no lo vuelva a pedir cada vez que se abre.
    staleTime: 5 * 60 * 1000,
  });
  const names = (vocab ?? [])
    .filter((t) => t.style === style)
    .map((t) => t.name);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (n: string) =>
    onChange(value.includes(n) ? value.filter((v) => v !== n) : [...value, n]);

  const label =
    value.length === 0
      ? 'Todos'
      : value.length === 1
        ? value[0]
        : `${value.length} seleccionados`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[9rem] items-center justify-between gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800"
      >
        <span className="truncate">{label}</span>
        <span className="text-neutral-500">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
          {names.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-neutral-500">
              Sin sub-estilos.
            </p>
          )}
          {names.map((n) => (
            <label
              key={n}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              <input
                type="checkbox"
                checked={value.includes(n)}
                onChange={() => toggle(n)}
                className="accent-[var(--color-brand)]"
              />
              {n}
            </label>
          ))}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
            >
              Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Selección múltiple de sub-estilos (máx 4) desde el vocabulario administrable,
 * filtrado por el estilo. Los seleccionados se muestran como píldoras.
 */
export function SubstyleMultiSelect({
  style,
  value,
  onChange,
}: {
  style: DanceStyle | '';
  value: string[];
  onChange: (names: string[]) => void;
}) {
  const { data: vocab } = useQuery({
    queryKey: ['tags-vocab'],
    queryFn: () => api<Tag[]>('/music/tags'),
    // El vocabulario de sub-estilos casi no cambia: se cachea para que el modal
    // no lo vuelva a pedir cada vez que se abre.
    staleTime: 5 * 60 * 1000,
  });

  // Sin estilo aún: no se muestran opciones.
  if (!style) {
    return (
      <p className="text-xs text-neutral-500">
        Selecciona primero el estilo para elegir sub-estilos.
      </p>
    );
  }

  const max = maxFor(style);

  // Solo sub-estilos del estilo seleccionado + los ya elegidos.
  const options = (vocab ?? [])
    .filter((t) => t.style === style)
    .map((t) => t.name);
  const all = Array.from(new Set([...options, ...value]));

  function toggle(name: string) {
    if (value.includes(name)) {
      onChange(value.filter((v) => v !== name));
    } else if (value.length < max) {
      onChange([...value, name]);
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {value.length === 0 && (
          <span className="text-xs text-neutral-500">Sin sub-estilos</span>
        )}
        {value.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white"
          >
            {name}
            <button
              type="button"
              onClick={() => toggle(name)}
              className="text-white/80 hover:text-white"
              aria-label={`Quitar ${name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="flex max-h-28 flex-wrap gap-1 overflow-auto">
        {all.map((name) => {
          const active = value.includes(name);
          const disabled = !active && value.length >= max;
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => toggle(name)}
              className={clsx(
                'rounded-full px-2 py-0.5 text-xs transition',
                active
                  ? 'bg-brand/20 text-brand'
                  : disabled
                    ? 'bg-neutral-900 text-neutral-600'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700',
              )}
            >
              {name}
            </button>
          );
        })}
        {all.length === 0 && (
          <span className="text-xs text-neutral-500">
            No hay sub-estilos en el vocabulario para este estilo.
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-neutral-500">Máximo {max}.</p>
    </div>
  );
}
