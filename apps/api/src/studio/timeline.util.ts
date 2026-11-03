import type { SongEnergy } from '@baile-latino/types';

/** Corre tiempos `shiftMs` (positivo = más tarde) y descarta los que quedan antes de 0. */
export function shiftTimes(times: readonly number[], shiftMs: number, maxMs?: number): number[] {
  const out: number[] = [];
  for (const t of times) {
    const v = Math.round(t + shiftMs);
    if (v < 0) continue;
    if (maxMs !== undefined && v > maxMs) continue;
    out.push(v);
  }
  return out;
}

/** Corre la curva de energía `shiftMs`, rellenando con 0 o recortando al inicio. */
export function shiftEnergy(energy: SongEnergy, shiftMs: number): SongEnergy {
  const steps = Math.round(shiftMs / energy.stepMs);
  if (steps === 0) return energy;
  const values =
    steps > 0
      ? [...new Array<number>(steps).fill(0), ...energy.values]
      : energy.values.slice(-steps);
  return { stepMs: energy.stepMs, values };
}
