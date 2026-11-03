import {
  FINGERPRINT_ITEM_MS,
  MATCH_SIMILARITY,
  alignOffsetMs,
  compareFingerprints,
} from './fingerprint.util';

/** PRNG determinista para huellas de prueba. */
function randomFingerprint(n: number, seed: number): number[] {
  let x = seed >>> 0;
  return Array.from({ length: n }, () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  });
}

/** Da vuelta ~`ratio` de los bits (simula otra compresión del mismo audio). */
function addNoise(fp: number[], ratio: number, seed: number): number[] {
  const noise = randomFingerprint(fp.length * 32, seed);
  return fp.map((v, i) => {
    let mask = 0;
    for (let b = 0; b < 32; b++) if (noise[i * 32 + b] / 2 ** 32 < ratio) mask |= 1 << b;
    return (v ^ mask) >>> 0;
  });
}

describe('compareFingerprints', () => {
  const base = randomFingerprint(900, 42);

  it('la misma huella es idéntica', () => {
    expect(compareFingerprints(base, base)).toEqual({ similarity: 1, shift: 0 });
  });

  it('reconoce el mismo audio con silencio extra al inicio y lo alinea', () => {
    // El archivo nuevo tiene 5 ítems (~620 ms) de silencio antes: archivo[i] ≈ grabación[i - 5].
    const withLead = [...randomFingerprint(5, 7), ...base];
    const m = compareFingerprints(withLead, base);
    expect(m.shift).toBe(-5);
    expect(m.similarity).toBe(1);
  });

  it('reconoce el mismo audio con otra compresión (10 % de bits distintos)', () => {
    const m = compareFingerprints(addNoise(base, 0.1, 9), base);
    expect(m.similarity).toBeGreaterThanOrEqual(MATCH_SIMILARITY);
    expect(m.shift).toBe(0);
  });

  it('dos canciones distintas no coinciden', () => {
    const m = compareFingerprints(randomFingerprint(900, 1), base);
    expect(m.similarity).toBeLessThan(MATCH_SIMILARITY);
  });

  it('con poco solapamiento no compara', () => {
    expect(compareFingerprints(base.slice(0, 20), base).similarity).toBe(0);
  });
});

describe('alignOffsetMs', () => {
  const recording = Array.from({ length: 100 }, (_, i) => 480 + i * 484);

  it('refina el desfase grueso de la huella al ms', () => {
    const file = recording.map((t) => t + 300);
    const coarse = 2 * FINGERPRINT_ITEM_MS; // ~248 ms: la huella solo da ±124 ms
    expect(alignOffsetMs(file, recording, coarse)).toBe(300);
  });

  it('funciona con desfase negativo y beats perdidos', () => {
    const file = recording.map((t) => t - 137).filter((t, i) => t >= 0 && i % 7 !== 0);
    expect(alignOffsetMs(file, recording, -FINGERPRINT_ITEM_MS)).toBe(-137);
  });

  it('sin beats cae a la estimación gruesa', () => {
    expect(alignOffsetMs([], recording, 123.8)).toBe(124);
  });
});
