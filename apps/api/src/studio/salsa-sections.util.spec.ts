import { INSTRUMENT_KEYS, type InstrumentKey, type SongInstruments } from '@baile-latino/types';
import { deriveSalsaSections } from './salsa-sections.util';

const BEAT = 300; // 200 BPM
const STEP = 250;

type Levels = Partial<Record<InstrumentKey, number>>;

/** Canción sintética: cada frase de 8 tiempos con niveles fijos por instrumento. */
function song(phrases: Levels[]) {
  const beatsMs = Array.from({ length: phrases.length * 8 }, (_, i) => i * BEAT);
  const tracks = Object.fromEntries(
    INSTRUMENT_KEYS.map((k) => [
      k,
      beatsMs.flatMap((_, b) => {
        const steps = Math.round(((b + 1) * BEAT) / STEP) - Math.round((b * BEAT) / STEP);
        return Array<number>(steps).fill(phrases[Math.floor(b / 8)][k] ?? 0);
      }),
    ]),
  ) as SongInstruments['tracks'];
  const phraseStarts = phrases.map((_, i) => i * 8);
  return { beatsMs, phraseStarts, instruments: { stepMs: STEP, tracks }, durationMs: phrases.length * 8 * BEAT };
}

const types = (phrases: Levels[]) => {
  const s = song(phrases);
  return deriveSalsaSections(s.beatsMs, s.phraseStarts, s.instruments, s.durationMs).sections.map((x) => x.type);
};
const rep = (l: Levels, n: number) => Array<Levels>(n).fill(l);

const BASE: Levels = { bass: 0.7, conga: 0.5, bongo: 0.5, guira: 0.5, guitar: 0.3 };
const INTRO: Levels = { ...BASE, other: 0.3 };
const VERSO: Levels = { ...BASE, vocals: 0.7 };
const CORO: Levels = { ...BASE, vocals: 0.1, coros: 0.8 };
const PREGON: Levels = { ...BASE, vocals: 0.7, coros: 0.35 };
const MAMBO: Levels = { ...BASE, other: 0.8 };
const SOLO: Levels = { ...BASE, conga: 0.9, bongo: 0.9 };

describe('deriveSalsaSections', () => {
  it('intro, verso, coro, verso, montuno, mambo, montuno', () => {
    expect(
      types([
        ...rep(INTRO, 2),
        ...rep(VERSO, 8),
        ...rep(CORO, 3),
        ...rep(VERSO, 8),
        ...rep(PREGON, 3),
        CORO,
        ...rep(PREGON, 2),
        ...rep(MAMBO, 3),
        ...rep(PREGON, 4),
      ]),
    ).toEqual(['INTRO', 'VERSO', 'CORO', 'VERSO', 'MONTUNO', 'MAMBO', 'MONTUNO']);
  });

  it('el estribillo antes de la última estrofa larga no es montuno', () => {
    const t = types([...rep(VERSO, 7), ...rep(CORO, 3), ...rep(VERSO, 7), ...rep(PREGON, 6)]);
    expect(t).toEqual(['VERSO', 'CORO', 'VERSO', 'MONTUNO']);
  });

  it('solo de percusión sin voz ni metales', () => {
    expect(types([...rep(VERSO, 7), ...rep(SOLO, 3), ...rep(PREGON, 6)])).toEqual(['VERSO', 'SOLO', 'MONTUNO']);
  });

  it('coros sin percusión al inicio quedan en la intro', () => {
    const coroSolo: Levels = { coros: 0.6, guitar: 0.5 };
    expect(types([...rep(coroSolo, 3), ...rep(VERSO, 6)])).toEqual(['INTRO', 'VERSO']);
  });

  it('una frase suelta se absorbe en la sección vecina', () => {
    expect(types([...rep(VERSO, 4), MAMBO, ...rep(VERSO, 4)])).toEqual(['VERSO']);
  });

  it('sin frases no hay secciones', () => {
    const s = song([]);
    expect(deriveSalsaSections([], [], s.instruments, 0)).toEqual({ sections: [], markers: [] });
  });
});
