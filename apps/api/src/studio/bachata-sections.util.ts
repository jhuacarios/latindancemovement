import type { InstrumentKey, SongInstruments, SongSectionType } from '@baile-latino/types';
import {
  type DerivedMarker,
  type DerivedSection,
  detectBreaks,
  groupSections,
  levelIn,
  phraseBounds,
  smoothSingles,
  sustainedRange,
} from './sections-common.util';

export { meanBetween } from './sections-common.util';
export type { DerivedMarker, DerivedSection } from './sections-common.util';

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

const PERCUSSION: InstrumentKey[] = ['guira', 'bongo', 'campana', 'tumba'];
// La campana no entra en la base rítmica: aparece y desaparece con el mambo (no es un break).
const RHYTHM: InstrumentKey[] = ['bass', 'guira', 'bongo', 'tumba'];

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

  // 1. Tipo de cada frase.
  const bounds = phraseBounds(beatsMs, phraseStarts, durationMs);
  const kinds = bounds.map((b) => phraseKind((k) => levelIn(instruments, k, b)));

  // 2. Intro / outro: todo lo que va antes de que la percusión se SOSTENGA y después de
  //    que deja de sostenerse. Sin percusión en medio de la canción → puente.
  const { first, last } = sustainedRange(kinds.map((k) => k !== 'NOPERC'));
  const types: SongSectionType[] = kinds.map((k, i) => {
    if (first === -1 || i < first) return 'INTRO';
    if (i > last) return 'OUTRO';
    return k === 'NOPERC' ? 'PUENTE' : k;
  });

  // 3. Suavizado: una frase suelta entre dos iguales (derecho/mambo) toma el tipo de sus vecinas.
  smoothSingles(types, new Set<SongSectionType>(['DERECHO', 'MAMBO']));

  // 4. Agrupar y 5. breaks (solo mientras suena la percusión).
  const sections = groupSections(types, bounds, durationMs);
  const fromMs = first === -1 ? Infinity : bounds[first].startMs;
  const toMs = first === -1 ? -Infinity : bounds[last].endMs;
  return { sections, markers: detectBreaks(beatsMs, instruments, RHYTHM, fromMs, toMs) };
}
