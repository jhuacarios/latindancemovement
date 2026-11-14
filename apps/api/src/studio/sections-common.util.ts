import type { InstrumentKey, SongInstruments, SongMarkerType, SongSectionType } from '@baile-latino/types';

/**
 * Piezas comunes de las secciones automáticas (bachata, salsa…): tramos por frase,
 * "sostenido" (entra y se mantiene), agrupación de frases y detección de breaks.
 */

export interface DerivedSection {
  type: SongSectionType;
  startMs: number;
  endMs: number;
}

export interface DerivedMarker {
  type: SongMarkerType;
  timeMs: number;
}

export interface PhraseBounds {
  startMs: number;
  endMs: number;
}

/** Un tiempo es break si la base rítmica cae bajo esta fracción de la mediana de su entorno. */
export const BREAK_DROP_RATIO = 0.3;
const BREAK_WINDOW_BEATS = 8;
const BREAK_MIN_CONTEXT = 0.2;

/** Promedio de una serie (un valor cada stepMs) entre dos tiempos. */
export function meanBetween(values: readonly number[], stepMs: number, startMs: number, endMs: number): number {
  const from = Math.max(0, Math.floor(startMs / stepMs));
  const to = Math.min(values.length, Math.max(from + 1, Math.ceil(endMs / stepMs)));
  if (from >= to) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i];
  return sum / (to - from);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Inicio y fin de cada frase de 8 tiempos. */
export function phraseBounds(
  beatsMs: readonly number[],
  phraseStarts: readonly number[],
  durationMs: number,
): PhraseBounds[] {
  return phraseStarts.map((idx, i) => {
    const next = phraseStarts[i + 1];
    const startMs = beatsMs[idx];
    const endMs = next !== undefined ? beatsMs[next] : (beatsMs[idx + 8] ?? durationMs);
    return { startMs, endMs };
  });
}

/** Nivel promedio de un instrumento en un tramo (0 si el análisis no lo trae). */
export function levelIn(instruments: SongInstruments, k: InstrumentKey, b: PhraseBounds): number {
  return meanBetween(instruments.tracks[k] ?? [], instruments.stepMs, b.startMs, b.endMs);
}

/**
 * Primera y última frase donde algo se SOSTIENE (2 frases seguidas): un golpe suelto
 * al inicio (un tag, un hit) no corta la intro, ni al final el outro. -1 si nunca.
 */
export function sustainedRange(on: readonly boolean[]): { first: number; last: number } {
  let first = on.findIndex((v, i) => v && (on[i + 1] ?? false));
  if (first === -1) first = on.indexOf(true);
  let last = -1;
  for (let i = on.length - 1; i >= 0; i--) {
    if (on[i] && (on[i - 1] ?? false)) {
      last = i;
      break;
    }
  }
  if (last === -1) last = on.lastIndexOf(true);
  return { first, last };
}

/** Una frase suelta entre dos iguales (de los tipos `flexible`) toma el tipo de sus vecinas. */
export function smoothSingles(types: SongSectionType[], flexible: ReadonlySet<SongSectionType>): void {
  for (let i = 1; i < types.length - 1; i++) {
    const prev = types[i - 1];
    if (prev === types[i + 1] && types[i] !== prev && flexible.has(prev) && flexible.has(types[i])) {
      types[i] = prev;
    }
  }
}

/** Agrupa frases seguidas del mismo tipo; la primera arranca en 0 (anacrusa) y la última llega al final. */
export function groupSections(
  types: readonly SongSectionType[],
  bounds: readonly PhraseBounds[],
  durationMs: number,
): DerivedSection[] {
  const sections: DerivedSection[] = [];
  types.forEach((type, i) => {
    const last = sections[sections.length - 1];
    if (last && last.type === type) {
      last.endMs = bounds[i].endMs;
    } else {
      sections.push({ type, startMs: i === 0 ? 0 : bounds[i].startMs, endMs: bounds[i].endMs });
    }
  });
  if (sections.length > 0) {
    sections[sections.length - 1].endMs = Math.max(sections[sections.length - 1].endMs, durationMs);
  }
  return sections;
}

/** Breaks: tiempo a tiempo, la base rítmica (`rhythm`) cae de golpe respecto de su entorno. */
export function detectBreaks(
  beatsMs: readonly number[],
  instruments: SongInstruments,
  rhythm: readonly InstrumentKey[],
  fromMs: number,
  toMs: number,
): DerivedMarker[] {
  const { stepMs, tracks } = instruments;
  const levels = beatsMs.map((t, j) => {
    const end = beatsMs[j + 1] ?? t + (beatsMs[j] - (beatsMs[j - 1] ?? t - 500));
    return rhythm.reduce((s, k) => s + meanBetween(tracks[k] ?? [], stepMs, t, end), 0) / rhythm.length;
  });
  const markers: DerivedMarker[] = [];
  let inBreak = false;
  levels.forEach((level, j) => {
    const t = beatsMs[j];
    const context = median([
      ...levels.slice(Math.max(0, j - BREAK_WINDOW_BEATS), j),
      ...levels.slice(j + 1, j + 1 + BREAK_WINDOW_BEATS),
    ]);
    const isBreak = t >= fromMs && t < toMs && context >= BREAK_MIN_CONTEXT && level < context * BREAK_DROP_RATIO;
    if (isBreak && !inBreak) markers.push({ type: 'BREAK', timeMs: t });
    inBreak = isBreak;
  });
  return markers;
}
