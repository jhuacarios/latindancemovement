/**
 * Comparación de huellas Chromaprint crudas (enteros de 32 bits, un ítem cada
 * ~124 ms) para reconocer la misma grabación entre archivos de distintos
 * usuarios, aunque uno tenga silencio extra al inicio o distinta compresión.
 */

/** Duración de un ítem de la huella: hop de 4096/3 muestras a 11025 Hz. */
export const FINGERPRINT_ITEM_MS = ((4096 / 3) / 11025) * 1000;

/** Desfase máximo que se busca entre dos archivos (~5 s). */
const MAX_SHIFT_ITEMS = 40;
/** Solapamiento mínimo para que la comparación valga (~6 s). */
const MIN_OVERLAP_ITEMS = 50;
/** Misma grabación: ≥ 80 % de bits iguales (canciones distintas rondan el 50 %). */
export const MATCH_SIMILARITY = 0.8;
/** Solo se comparan grabaciones de duración parecida. */
export const MATCH_DURATION_WINDOW_MS = 15_000;

function popcount32(x: number): number {
  let v = x >>> 0;
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export interface FingerprintMatch {
  /** 0..1: proporción de bits iguales en el mejor alineamiento. */
  similarity: number;
  /** a[i] ≈ b[i + shift]. */
  shift: number;
}

export function compareFingerprints(
  a: readonly number[],
  b: readonly number[],
  maxShift = MAX_SHIFT_ITEMS,
): FingerprintMatch {
  let best: FingerprintMatch = { similarity: 0, shift: 0 };
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    const start = Math.max(0, -shift);
    const end = Math.min(a.length, b.length - shift);
    const overlap = end - start;
    if (overlap < MIN_OVERLAP_ITEMS) continue;
    let errors = 0;
    for (let i = start; i < end; i++) errors += popcount32(a[i] ^ b[i + shift]);
    const similarity = 1 - errors / (32 * overlap);
    if (similarity > best.similarity) best = { similarity, shift };
  }
  return best;
}

/**
 * Desfase exacto (ms) del archivo nuevo respecto de la grabación:
 * tiempo en el archivo = tiempo en la grabación + offset.
 *
 * La huella solo da una estimación gruesa (±1 ítem ≈ 124 ms), demasiado para una
 * grilla de beats; se refina con la mediana de la distancia entre los beats del
 * archivo y los beats más cercanos de la grabación.
 */
export function alignOffsetMs(
  fileBeatsMs: readonly number[],
  recordingBeatsMs: readonly number[],
  coarseOffsetMs: number,
): number {
  if (fileBeatsMs.length === 0 || recordingBeatsMs.length === 0) return Math.round(coarseOffsetMs);
  const diffs: number[] = [];
  let j = 0;
  for (const t of fileBeatsMs) {
    const target = t - coarseOffsetMs;
    while (
      j + 1 < recordingBeatsMs.length &&
      Math.abs(recordingBeatsMs[j + 1] - target) <= Math.abs(recordingBeatsMs[j] - target)
    ) {
      j++;
    }
    const d = t - recordingBeatsMs[j];
    if (Math.abs(d - coarseOffsetMs) <= 150) diffs.push(d);
  }
  if (diffs.length === 0) return Math.round(coarseOffsetMs);
  diffs.sort((x, y) => x - y);
  return Math.round(diffs[Math.floor(diffs.length / 2)]);
}
