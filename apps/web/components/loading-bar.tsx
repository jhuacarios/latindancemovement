'use client';

import { useEffect, useState } from 'react';

/**
 * Barra de avance para cargas sin progreso real (una sola request). Avanza de
 * forma estimada hacia ~95% mientras está montada; al terminar la carga, el
 * padre la desmonta. Da feedback de "avanzando" sin mentir con un 100%.
 */
export function LoadingBar({
  label,
  estMs = 8000,
}: {
  label?: string;
  /** Tiempo estimado de la carga (ms), para la velocidad del avance. */
  estMs?: number;
}) {
  const [pct, setPct] = useState(6);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      const p = Math.min(95, Math.round(((Date.now() - start) / estMs) * 100));
      setPct((prev) => (p > prev ? p : prev));
    }, 200);
    return () => clearInterval(t);
  }, [estMs]);

  return (
    <div className="space-y-2">
      {label && <p className="text-sm text-neutral-400">{label}</p>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full bg-brand transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
