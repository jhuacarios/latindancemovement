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

/**
 * Secciones automáticas de una SALSA a partir de la actividad de instrumentos.
 * Frase por frase (8 tiempos):
 *
 *  - INTRO: hasta que la voz Y la percusión ya se sostienen (en salsa es común que
 *    los coros o los metales abran la canción antes de que entre la base).
 *  - Con voz (sonero o coros):
 *      · Antes del montuno: VERSO (el tema, canta el sonero) o CORO (estribillo).
 *      · MONTUNO: el coro-pregón (coro y sonero se turnan). Empieza en el primer coro
 *        después de la última estrofa larga del sonero sin coro.
 *  - Sin voz:
 *      · Metales arriba → MAMBO (la sección de metales).
 *      · Percusión, guitarra/tres o piano arriba → SOLO.
 *      · Lo demás → PUENTE (o OUTRO después de la última voz).
 *  - Tramos de una sola frase se absorben en la sección vecina.
 *  - Caída brusca de la base rítmica (bajo, congas, bongó/timbal, güiro) → marca BREAK.
 *
 * Nombres de las pistas en salsa: other = metales, keys = piano, bongo = bongó/timbal,
 * guira = güiro/maracas, guitar = guitarra/tres. Calibrado con "Ran Kan Kan"
 * (Tito Puente) y "Un montón de estrellas" (Polo Montañez).
 */

export const VOICE_FROM = 0.3;
/** En el montuno el coro responde dentro de la frase: con este nivel ya cuenta como frase con coro. */
export const CORO_FROM = 0.3;
export const PERCUSSION_FROM = 0.25;
export const MAMBO_METALES_FROM = 0.5;
export const SOLO_FROM = 0.6;
/** Una estrofa del sonero sin coro de al menos estas frases seguidas todavía es tema (no montuno). */
const VERSO_RUN = 6;
const MIN_RUN = 2;

const PERCUSSION: InstrumentKey[] = ['conga', 'bongo', 'campana', 'guira'];
const RHYTHM: InstrumentKey[] = ['bass', 'conga', 'bongo', 'guira'];

type PhraseKind = 'VOZ' | 'CORO' | 'MAMBO' | 'SOLO' | 'INST';

interface Phrase {
  kind: PhraseKind;
  voice: boolean;
  percussion: boolean;
}

function classify(level: (k: InstrumentKey) => number): Phrase {
  const lead = level('vocals');
  const coros = level('coros');
  const perc = Math.max(...PERCUSSION.map(level));
  const voice = Math.max(lead, coros) >= VOICE_FROM;
  const percussion = perc >= PERCUSSION_FROM;
  let kind: PhraseKind;
  if (voice) kind = coros >= CORO_FROM ? 'CORO' : 'VOZ';
  else if (level('other') >= MAMBO_METALES_FROM) kind = 'MAMBO';
  else if (Math.max(perc, level('guitar'), level('keys')) >= SOLO_FROM) kind = 'SOLO';
  else kind = 'INST';
  return { kind, voice, percussion };
}

/** Índice de la frase donde empieza el montuno, o -1. */
function montunoStart(kinds: readonly PhraseKind[]): number {
  // Tiene que haber tema antes: el montuno no es lo primero que se canta.
  const firstVoz = kinds.indexOf('VOZ');
  if (firstVoz === -1) return -1;
  // Fin de la última estrofa larga del sonero sin coro (las frases instrumentales no la cortan).
  let afterVerses = firstVoz;
  let run = 0;
  kinds.forEach((k, i) => {
    if (k === 'VOZ') {
      run++;
      if (run >= VERSO_RUN) afterVerses = i;
    } else if (k === 'CORO') {
      run = 0;
    }
  });
  const start = kinds.findIndex((k, i) => i > afterVerses && k === 'CORO');
  if (start === -1) return -1;
  const sungAfter = kinds.slice(start).filter((k) => k === 'VOZ' || k === 'CORO').length;
  return sungAfter >= 4 ? start : -1;
}

/**
 * Tramos de menos de MIN_RUN frases toman el tipo de la sección anterior (o la siguiente,
 * al inicio). Intro y outro se respetan aunque sean de una frase.
 */
function absorbShortRuns(types: SongSectionType[]): void {
  let i = 0;
  while (i < types.length) {
    let j = i;
    while (j < types.length && types[j] === types[i]) j++;
    const short = j - i < MIN_RUN && types[i] !== 'INTRO' && types[i] !== 'OUTRO';
    const neighbor = i > 0 ? types[i - 1] : types[j];
    if (short && neighbor !== undefined) types.fill(neighbor, i, j);
    i = j;
  }
}

export function deriveSalsaSections(
  beatsMs: readonly number[],
  phraseStarts: readonly number[],
  instruments: SongInstruments,
  durationMs: number,
): { sections: DerivedSection[]; markers: DerivedMarker[] } {
  if (phraseStarts.length === 0) return { sections: [], markers: [] };

  const bounds = phraseBounds(beatsMs, phraseStarts, durationMs);
  const phrases = bounds.map((b) => classify((k) => levelIn(instruments, k, b)));
  const kinds = phrases.map((p) => p.kind);
  const montuno = montunoStart(kinds);

  const voice = sustainedRange(phrases.map((p) => p.voice));
  const perc = sustainedRange(phrases.map((p) => p.percussion));
  const introEnd = voice.first === -1 ? phrases.length : Math.max(voice.first, perc.first);
  const types: SongSectionType[] = kinds.map((k, i) => {
    if (i < introEnd) return 'INTRO';
    if (k === 'MAMBO' || k === 'SOLO') return k;
    if (k === 'INST') return i > voice.last ? 'OUTRO' : 'PUENTE';
    if (montuno !== -1 && i >= montuno) return 'MONTUNO';
    return k === 'CORO' ? 'CORO' : 'VERSO';
  });

  smoothSingles(types, new Set<SongSectionType>(['VERSO', 'CORO', 'MONTUNO', 'MAMBO', 'SOLO']));
  absorbShortRuns(types);

  const sections = groupSections(types, bounds, durationMs);
  const fromMs = bounds[0].startMs;
  const toMs = bounds[bounds.length - 1].endMs;
  return { sections, markers: detectBreaks(beatsMs, instruments, RHYTHM, fromMs, toMs) };
}
