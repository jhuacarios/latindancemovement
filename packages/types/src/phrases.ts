/**
 * Lógica de frases de 8 tiempos (módulo Estudio). Funciones puras compartidas
 * por la API y el web, para que ambos cuenten exactamente igual.
 */

const PHRASE = 8;

/** Índice del beat más cercano a `timeMs` (beats ordenados). -1 si no hay beats. */
export function nearestBeatIndex(beatsMs: readonly number[], timeMs: number): number {
  if (beatsMs.length === 0) return -1;
  let lo = 0;
  let hi = beatsMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beatsMs[mid] < timeMs) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && timeMs - beatsMs[lo - 1] <= beatsMs[lo] - timeMs) return lo - 1;
  return lo;
}

/**
 * Índices (en `beatsMs`) donde cae el "1" de cada frase, dado el "1" elegido.
 * Incluye las frases anteriores al ancla: si el usuario marca el 1 en el beat
 * 10, también son 1 el beat 2 y, hacia adelante, el 18, el 26…
 */
export function phraseStartIndexes(beatsMs: readonly number[], firstBeatMs: number | null): number[] {
  if (beatsMs.length === 0 || firstBeatMs === null) return [];
  const anchor = nearestBeatIndex(beatsMs, firstBeatMs);
  const out: number[] = [];
  for (let i = anchor % PHRASE; i < beatsMs.length; i += PHRASE) out.push(i);
  return out;
}

/** Conteo (1..8) del beat `beatIndex`, dado el índice del "1" de referencia. */
export function countOfBeat(beatIndex: number, anchorIndex: number): number {
  return ((((beatIndex - anchorIndex) % PHRASE) + PHRASE) % PHRASE) + 1;
}
