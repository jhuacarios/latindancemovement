import { countOfBeat, nearestBeatIndex, phraseStartIndexes } from '@baile-latino/types';

/** Beats cada 500 ms (120 BPM) desde 400 ms. */
const beats = Array.from({ length: 40 }, (_, i) => 400 + i * 500);

describe('nearestBeatIndex', () => {
  it('encuentra el beat más cercano', () => {
    expect(nearestBeatIndex(beats, 400)).toBe(0);
    expect(nearestBeatIndex(beats, 1380)).toBe(2); // 1400
    expect(nearestBeatIndex(beats, 1120)).toBe(1); // 900 está a 220, 1400 a 280
    expect(nearestBeatIndex(beats, 0)).toBe(0);
    expect(nearestBeatIndex(beats, 999_999)).toBe(39);
  });

  it('en empate exacto elige el anterior', () => {
    expect(nearestBeatIndex(beats, 650)).toBe(0);
  });

  it('sin beats devuelve -1', () => {
    expect(nearestBeatIndex([], 100)).toBe(-1);
  });
});

describe('phraseStartIndexes (corregir el "1")', () => {
  it('agrupa de a 8 desde el "1"', () => {
    expect(phraseStartIndexes(beats, 400)).toEqual([0, 8, 16, 24, 32]);
  });

  it('al mover el "1" se recalcula toda la grilla, también hacia atrás', () => {
    // El usuario toca cerca del beat 10 (5400 ms): también son "1" el 2, 18, 26, 34.
    expect(phraseStartIndexes(beats, 5430)).toEqual([2, 10, 18, 26, 34]);
  });

  it('mover el "1" un tiempo corre todas las frases un tiempo', () => {
    const before = phraseStartIndexes(beats, beats[0]);
    const after = phraseStartIndexes(beats, beats[1]);
    expect(after).toEqual(before.map((i) => i + 1));
  });

  it('sin "1" o sin beats no hay frases', () => {
    expect(phraseStartIndexes(beats, null)).toEqual([]);
    expect(phraseStartIndexes([], 400)).toEqual([]);
  });
});

describe('countOfBeat', () => {
  it('cuenta 1..8 desde el ancla, también antes de ella', () => {
    expect([8, 9, 10, 15, 16].map((i) => countOfBeat(i, 8))).toEqual([1, 2, 3, 8, 1]);
    expect([7, 6, 0].map((i) => countOfBeat(i, 8))).toEqual([8, 7, 1]);
  });
});
