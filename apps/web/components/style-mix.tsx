'use client';

import { STYLE_MIX_STEP, styleMixLabel } from '@baile-latino/types';

// Colores de los estilos (los mismos de StyleBadge: ámbar = bachata, rojo = salsa).
const BACHATA = '#f59e0b';
const SALSA = '#ef4444';

/** Deslizador Bachata ↔ Salsa. `value` = % de bachata (0–100). */
export function StyleMixSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (pct: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-amber-300">Bachata {value}%</span>
        <span className="text-red-300">Salsa {100 - value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={STYLE_MIX_STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Porcentaje de bachata (el resto es salsa)"
        aria-valuetext={styleMixLabel(value)}
        className="mix-range w-full"
        style={{
          background: `linear-gradient(to right, ${BACHATA} 0%, ${BACHATA} ${value}%, ${SALSA} ${value}%, ${SALSA} 100%)`,
        }}
      />
      <span className="text-xs text-neutral-400">{styleMixLabel(value)}</span>
    </div>
  );
}

/** Barrita de solo lectura con la mezcla (para tarjetas). */
export function StyleMixBar({ pct }: { pct: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={styleMixLabel(pct)}>
      <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-neutral-800">
        <span style={{ width: `${pct}%`, background: BACHATA }} />
        <span style={{ width: `${100 - pct}%`, background: SALSA }} />
      </span>
      <span className="text-neutral-400">
        {pct >= 100 ? 'Bachata' : pct <= 0 ? 'Salsa' : `${pct}% B · ${100 - pct}% S`}
      </span>
    </span>
  );
}
