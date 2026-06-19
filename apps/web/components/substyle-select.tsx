'use client';

import { useQuery } from '@tanstack/react-query';
import type { DanceStyle, Tag } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Select } from './ui';
import { clsx } from './clsx';

const MAX = 3;

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
 * Selección múltiple de sub-estilos (máx 3) desde el vocabulario administrable,
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
  });

  // Sin estilo aún: no se muestran opciones.
  if (!style) {
    return (
      <p className="text-xs text-neutral-500">
        Selecciona primero el estilo para elegir sub-estilos.
      </p>
    );
  }

  // Solo sub-estilos del estilo seleccionado + los ya elegidos.
  const options = (vocab ?? [])
    .filter((t) => t.style === style)
    .map((t) => t.name);
  const all = Array.from(new Set([...options, ...value]));

  function toggle(name: string) {
    if (value.includes(name)) {
      onChange(value.filter((v) => v !== name));
    } else if (value.length < MAX) {
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
          const disabled = !active && value.length >= MAX;
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
      <p className="mt-1 text-[10px] text-neutral-500">Máximo {MAX}.</p>
    </div>
  );
}
