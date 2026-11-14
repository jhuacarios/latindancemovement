import type { InstrumentKey, SongInstruments, SongMarkerType, SongSectionType } from '@baile-latino/types';

/**
 * Secciones automáticas de una BACHATA a partir de la actividad de instrumentos.
 * Se evalúa frase por frase (8 tiempos) y se agrupan las frases seguidas del
 * mismo tipo. Son una propuesta: el usuario las corrige.
 *
 *  - Sin percusión → INTRO (antes de que entre), OUTRO (después de que sale) o PUENTE (en medio).
 *  - Sin voz principal y con la guitarra / el requinto / la campana / la banda / la güira arriba → MAMBO.
 *    (Los coros no cuentan como voz: en el mambo es común que solo canten los coros.)
 *  - El resto (con voz y percusión) → DERECHO.
 *  - Caída brusca de la base rítmica (bajo + percusión) en un tiempo → marca BREAK.
 *
 * Calibrado con la prueba sobre "Rulay A Tu Manera": la tumba suena casi toda la
 * canción (no distingue derecho de mambo); lo que mejor marca el mambo es que se
 * va la voz y sube el requinto. La campana (cencerro del bongosero) es señal
 * directa de mambo cuando aparece.
 */

export const NO_PERCUSSION_BELOW = 0.25;
export const MAMBO_VOCALS_BELOW = 0.35;
export const MAMBO_GUITAR_FROM = 0.5;
export const MAMBO_OTHER_FROM = 0.5;
export const MAMBO_GUIRA_FROM = 0.6;
export const MAMBO_REQUINTO_FROM = 0.5;
export const MAMBO_CAMPANA_FROM = 0.4;
/** Un tiempo es break si la base rítmica cae bajo esta fracción de la mediana de su entorno. */
export const BREAK_DROP_RATIO = 0.3;
const BREAK_WINDOW_BEATS = 8;
const BREAK_MIN_CONTEXT = 0.2;

export interface DerivedSection {
  type: SongSectionType;
  startMs: number;
  endMs: number;
}

export interface DerivedMarker {
  type: SongMarkerType;
  timeMs: number;
}

const PERCUSSION: InstrumentKey[] = ['guira', 'bongo', 'campana', 'tumba'];
// La campana no entra en la base rítmica: aparece y desaparece con el mambo (no es un break).
const RHYTHM: InstrumentKey[] = ['bass', 'guira', 'bongo', 'tumba'];

/** Promedio de una serie (un valor cada stepMs) entre dos tiempos. */
export function meanBetween(values: readonly number[], stepMs: number, startMs: number, endMs: number): number {
  const from = Math.max(0, Math.floor(startMs / stepMs));
  const to = Math.min(values.length, Math.max(from + 1, Math.ceil(endMs / stepMs)));
  if (from >= to) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i];
  return sum / (to - from);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type PhraseKind = 'DERECHO' | 'MAMBO' | 'NOPERC';

function phraseKind(level: (k: InstrumentKey) => number): PhraseKind {
  const percussion = Math.max(...PERCUSSION.map(level));
  if (percussion < NO_PERCUSSION_BELOW) return 'NOPERC';
  const band =
    level('guitar') >= MAMBO_GUITAR_FROM ||
    level('other') >= MAMBO_OTHER_FROM ||
    level('guira') >= MAMBO_GUIRA_FROM ||
    level('requinto') >= MAMBO_REQUINTO_FROM ||
    level('campana') >= MAMBO_CAMPANA_FROM;
  if (level('vocals') < MAMBO_VOCALS_BELOW && band) return 'MAMBO';
  return 'DERECHO';
}

export function deriveBachataSections(
  beatsMs: readonly number[],
  phraseStarts: readonly number[],
  instruments: SongInstruments,
  durationMs: number,
): { sections: DerivedSection[]; markers: DerivedMarker[] } {
  if (phraseStarts.length === 0) return { sections: [], markers: [] };
  const { stepMs, tracks } = instruments;

  // 1. Tipo de cada frase.
  const bounds = phraseStarts.map((idx, i) => {
    const next = phraseStarts[i + 1];
    const startMs = beatsMs[idx];
    const endMs = next !== undefined ? beatsMs[next] : (beatsMs[idx + 8] ?? durationMs);
    return { startMs, endMs };
  });
  const kinds = bounds.map(({ startMs, endMs }) =>
    phraseKind((k) => meanBetween(tracks[k] ?? [], stepMs, startMs, endMs)),
  );

  // 2. Intro / outro: todo lo que va antes de que la percusión se SOSTENGA (2 frases
  //    seguidas) y después de que deja de sostenerse; un golpe suelto al inicio (un
  //    tag, un hit) no corta la intro. Sin percusión en medio de la canción → puente.
  const perc = kinds.map((k) => k !== 'NOPERC');
  const sustained = (i: number) => perc[i] && (perc[i + 1] ?? false);
  let firstPerc = perc.findIndex((_, i) => sustained(i));
  if (firstPerc === -1) firstPerc = perc.indexOf(true);
  let lastPerc = -1;
  for (let i = perc.length - 1; i >= 0; i--) {
    if (perc[i] && (perc[i - 1] ?? false)) {
      lastPerc = i;
      break;
    }
  }
  if (lastPerc === -1) lastPerc = perc.lastIndexOf(true);
  const types: SongSectionType[] = kinds.map((k, i) => {
    if (firstPerc === -1 || i < firstPerc) return 'INTRO';
    if (i > lastPerc) return 'OUTRO';
    return k === 'NOPERC' ? 'PUENTE' : k;
  });

  // 3. Suavizado: una frase suelta entre dos iguales (derecho/mambo) toma el tipo de sus vecinas.
  const flexible = (t: SongSectionType) => t === 'DERECHO' || t === 'MAMBO';
  for (let i = 1; i < types.length - 1; i++) {
    const prev = types[i - 1];
    if (prev === types[i + 1] && types[i] !== prev && flexible(prev) && flexible(types[i])) {
      types[i] = prev;
    }
  }

  // 4. Agrupar frases seguidas; la primera arranca en 0 (incluye la anacrusa) y la última llega al final.
  const sections: DerivedSection[] = [];
  types.forEach((type, i) => {
    const last = sections[sections.length - 1];
    if (last && last.type === type) {
      last.endMs = bounds[i].endMs;
    } else {
      sections.push({ type, startMs: i === 0 ? 0 : bounds[i].startMs, endMs: bounds[i].endMs });
    }
  });
  sections[sections.length - 1].endMs = Math.max(sections[sections.length - 1].endMs, durationMs);

  // 5. Breaks: tiempo a tiempo, la base rítmica cae de golpe respecto de su entorno.
  const rhythm = beatsMs.map((t, j) => {
    const end = beatsMs[j + 1] ?? t + (beatsMs[j] - (beatsMs[j - 1] ?? t - 500));
    return RHYTHM.reduce((s, k) => s + meanBetween(tracks[k] ?? [], stepMs, t, end), 0) / RHYTHM.length;
  });
  const percStart = firstPerc === -1 ? Infinity : bounds[firstPerc].startMs;
  const percEnd = firstPerc === -1 ? -Infinity : bounds[lastPerc].endMs;
  const markers: DerivedMarker[] = [];
  let inBreak = false;
  rhythm.forEach((level, j) => {
    const t = beatsMs[j];
    const context = median([
      ...rhythm.slice(Math.max(0, j - BREAK_WINDOW_BEATS), j),
      ...rhythm.slice(j + 1, j + 1 + BREAK_WINDOW_BEATS),
    ]);
    const isBreak =
      t >= percStart && t < percEnd && context >= BREAK_MIN_CONTEXT && level < context * BREAK_DROP_RATIO;
    if (isBreak && !inBreak) markers.push({ type: 'BREAK', timeMs: t });
    inBreak = isBreak;
  });

  return { sections, markers };
}
