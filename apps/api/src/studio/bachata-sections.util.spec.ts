import { INSTRUMENT_KEYS, type InstrumentKey, type SongInstruments } from '@baile-latino/types';
import { deriveBachataSections, meanBetween } from './bachata-sections.util';

const BEAT = 500; // 120 BPM
const STEP = 250;

type Levels = Partial<Record<InstrumentKey, number>>;

/** Canción sintética: cada frase de 8 tiempos con niveles fijos por instrumento. */
function song(phrases: Levels[]) {
  const beatsMs = Array.from({ length: phrases.length * 8 }, (_, i) => i * BEAT);
  const stepsPerPhrase = (8 * BEAT) / STEP;
  const tracks = Object.fromEntries(
    INSTRUMENT_KEYS.map((k) => [k, phrases.flatMap((p) => Array<number>(stepsPerPhrase).fill(p[k] ?? 0))]),
  ) as SongInstruments['tracks'];
  const phraseStarts = phrases.map((_, i) => i * 8);
  return { beatsMs, phraseStarts, instruments: { stepMs: STEP, tracks }, durationMs: phrases.length * 8 * BEAT };
}

const derive = (s: ReturnType<typeof song>) =>
  deriveBachataSections(s.beatsMs, s.phraseStarts, s.instruments, s.durationMs);

const INTRO: Levels = { guitar: 0.8, vocals: 0.6 };
const DERECHO: Levels = { vocals: 0.8, bongo: 0.8, guira: 0.5, bass: 0.7, tumba: 0.7, guitar: 0.5 };
const MAMBO: Levels = { vocals: 0.05, guitar: 0.9, guira: 0.8, bongo: 0.6, bass: 0.8, tumba: 0.8 };

describe('meanBetween', () => {
  it('promedia los pasos dentro del tramo', () => {
    expect(meanBetween([0, 1, 1, 0], 250, 250, 750)).toBe(1);
    expect(meanBetween([0, 1, 1, 0], 250, 0, 1000)).toBe(0.5);
  });
  it('fuera de rango da 0', () => {
    expect(meanBetween([1, 1], 250, 5000, 6000)).toBe(0);
  });
});

describe('deriveBachataSections', () => {
  it('intro, derecho, mambo, derecho, outro', () => {
    const s = song([INTRO, INTRO, DERECHO, DERECHO, MAMBO, MAMBO, DERECHO, INTRO]);
    const { sections } = derive(s);
    expect(sections.map((x) => x.type)).toEqual(['INTRO', 'DERECHO', 'MAMBO', 'DERECHO', 'OUTRO']);
    expect(sections[0].startMs).toBe(0);
    expect(sections[1]).toMatchObject({ startMs: 8000, endMs: 16000 });
    expect(sections[sections.length - 1].endMs).toBe(s.durationMs);
  });

  it('una frase suelta entre dos iguales se absorbe', () => {
    const { sections } = derive(song([DERECHO, DERECHO, MAMBO, DERECHO, DERECHO]));
    expect(sections.map((x) => x.type)).toEqual(['DERECHO']);
  });

  it('un golpe suelto de percusión al inicio no corta la intro (ni al final el outro)', () => {
    const { sections } = derive(song([DERECHO, INTRO, INTRO, DERECHO, DERECHO, INTRO, DERECHO]));
    expect(sections.map((x) => x.type)).toEqual(['INTRO', 'DERECHO', 'OUTRO']);
  });

  it('mambo con coros y campana: los coros no cuentan como voz principal', () => {
    const MAMBO_COROS: Levels = { vocals: 0.1, coros: 0.9, guitar: 0.3, campana: 0.7, bongo: 0.5, bass: 0.7, tumba: 0.7 };
    const { sections } = derive(song([DERECHO, DERECHO, MAMBO_COROS, MAMBO_COROS, DERECHO, DERECHO]));
    expect(sections.map((x) => x.type)).toEqual(['DERECHO', 'MAMBO', 'DERECHO']);
  });

  it('mambo marcado por el requinto aunque la guitarra total no suba tanto', () => {
    const MAMBO_REQ: Levels = { vocals: 0.1, guitar: 0.4, requinto: 0.8, guira: 0.4, bongo: 0.6, bass: 0.7, tumba: 0.7 };
    const { sections } = derive(song([DERECHO, DERECHO, MAMBO_REQ, MAMBO_REQ, DERECHO, DERECHO]));
    expect(sections.map((x) => x.type)).toEqual(['DERECHO', 'MAMBO', 'DERECHO']);
  });

  it('un análisis anterior sin los instrumentos nuevos sigue funcionando', () => {
    const s = song([INTRO, INTRO, DERECHO, DERECHO, MAMBO, MAMBO, DERECHO, INTRO]);
    for (const k of ['coros', 'requinto', 'segunda', 'campana', 'keys'] as const) delete s.instruments.tracks[k];
    expect(derive(s).sections.map((x) => x.type)).toEqual(['INTRO', 'DERECHO', 'MAMBO', 'DERECHO', 'OUTRO']);
  });

  it('sin percusión en medio de la canción es PUENTE', () => {
    const { sections } = derive(song([DERECHO, DERECHO, INTRO, DERECHO, DERECHO]));
    expect(sections.map((x) => x.type)).toEqual(['DERECHO', 'PUENTE', 'DERECHO']);
  });

  it('marca un break cuando la base rítmica cae en un tiempo', () => {
    const s = song([DERECHO, DERECHO, DERECHO]);
    // Silencio de bajo y percusión en el tiempo 12 (entre 6000 y 6500 ms).
    for (const k of ['bass', 'guira', 'bongo', 'tumba'] as const) {
      s.instruments.tracks[k][24] = 0;
      s.instruments.tracks[k][25] = 0;
    }
    const { markers } = derive(s);
    expect(markers).toEqual([{ type: 'BREAK', timeMs: 6000 }]);
  });

  it('sin breaks en una canción pareja ni en la intro', () => {
    expect(derive(song([INTRO, DERECHO, DERECHO, MAMBO])).markers).toEqual([]);
  });

  it('sin frases no hay secciones', () => {
    expect(deriveBachataSections([], [], song([DERECHO]).instruments, 0)).toEqual({ sections: [], markers: [] });
  });
});
