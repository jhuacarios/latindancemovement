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
 *
 * `changesMs` son los cambios de tiempo ("desde acá el 1 es este"): cada uno
 * reinicia la cuenta de 8 desde su beat hasta el siguiente cambio. La frase que
 * queda antes de un cambio puede ser más corta (p. ej. el compás de 4 que meten
 * muchas bachatas y salsas antes del derecho o del mambo).
 */
export function phraseStartIndexes(
  beatsMs: readonly number[],
  firstBeatMs: number | null,
  changesMs: readonly number[] = [],
): number[] {
  if (beatsMs.length === 0) return [];
  const changes = [...new Set(changesMs.map((t) => nearestBeatIndex(beatsMs, t)))].sort((a, b) => a - b);
  if (firstBeatMs === null && changes.length === 0) return [];
  const out: number[] = [];
  const firstEnd = changes[0] ?? beatsMs.length;
  if (firstBeatMs !== null) {
    const anchor = nearestBeatIndex(beatsMs, firstBeatMs);
    for (let i = anchor % PHRASE; i < firstEnd; i += PHRASE) out.push(i);
  }
  changes.forEach((start, k) => {
    const end = changes[k + 1] ?? beatsMs.length;
    for (let i = start; i < end; i += PHRASE) out.push(i);
  });
  return out;
}

/**
 * Conteo (1..8) del beat `beatIndex` según los "1" de las frases (respeta los
 * cambios de tiempo). Antes del primer "1" se cuenta hacia atrás desde él.
 */
export function countInPhrases(beatIndex: number, phraseStarts: readonly number[]): number | null {
  if (beatIndex < 0 || phraseStarts.length === 0) return null;
  let lo = 0;
  let hi = phraseStarts.length - 1;
  if (beatIndex < phraseStarts[0]) return countOfBeat(beatIndex, phraseStarts[0]);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (phraseStarts[mid] <= beatIndex) lo = mid;
    else hi = mid - 1;
  }
  return beatIndex - phraseStarts[lo] + 1;
}

/**
 * Al marcar "el 1 acá" se redondea al 1 o al 5 más cercano de la cuenta actual
 * (en empate, hacia adelante: el 3 va al 5 y el 7 al 1 siguiente). Devuelve el
 * índice del beat elegido y si eso cambia algo (null = ya era un 1 o no hay beats).
 */
export function snapPhraseChange(
  beatsMs: readonly number[],
  phraseStarts: readonly number[],
  timeMs: number,
): number | null {
  const beat = nearestBeatIndex(beatsMs, timeMs);
  const count = countInPhrases(beat, phraseStarts);
  if (beat < 0 || count === null) return null;
  const back = (count - 1) % 4;
  const target = back < 2 ? beat - back : beat + (4 - back);
  if (target < 0 || target >= beatsMs.length) return null;
  return countInPhrases(target, phraseStarts) === 1 ? null : target;
}

/** Conteo (1..8) del beat `beatIndex`, dado el índice del "1" de referencia. */
export function countOfBeat(beatIndex: number, anchorIndex: number): number {
  return ((((beatIndex - anchorIndex) % PHRASE) + PHRASE) % PHRASE) + 1;
}
