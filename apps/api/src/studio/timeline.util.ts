import type { InstrumentKey, SongEnergy, SongInstruments } from '@baile-latino/types';

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

/** Corre una serie (un valor cada `stepMs`) `shiftMs`, rellenando con 0 o recortando al inicio. */
export function shiftSeries(values: number[], stepMs: number, shiftMs: number): number[] {
  const steps = Math.round(shiftMs / stepMs);
  if (steps === 0) return values;
  return steps > 0 ? [...new Array<number>(steps).fill(0), ...values] : values.slice(-steps);
}

/** Corre la curva de energía `shiftMs`. */
export function shiftEnergy(energy: SongEnergy, shiftMs: number): SongEnergy {
  return { stepMs: energy.stepMs, values: shiftSeries(energy.values, energy.stepMs, shiftMs) };
}

/** Corre la actividad de instrumentos `shiftMs` (cada pista igual que la energía). */
export function shiftInstruments(instruments: SongInstruments, shiftMs: number): SongInstruments {
  const tracks = Object.fromEntries(
    Object.entries(instruments.tracks).map(([k, v]) => [k, shiftSeries(v, instruments.stepMs, shiftMs)]),
  ) as Record<InstrumentKey, number[]>;
  return { stepMs: instruments.stepMs, tracks };
}
