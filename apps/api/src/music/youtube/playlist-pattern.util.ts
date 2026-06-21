/**
 * Baraja una copia del arreglo (Fisher-Yates). No muta el original.
 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Intercala dos grupos en bloques (nB del primero, nS del segundo) y repite.
 * Solo agrega bloques COMPLETOS: corta en cuanto el siguiente bloque no se
 * puede formar (no hay suficientes de algún grupo). Devuelve el orden final.
 */
export function interleavePattern<T>(
  groupA: T[],
  groupB: T[],
  nA = 5,
  nB = 3,
): T[] {
  const out: T[] = [];
  let ai = 0;
  let bi = 0;
  while (groupA.length - ai >= nA && groupB.length - bi >= nB) {
    for (let k = 0; k < nA; k++) out.push(groupA[ai++]);
    for (let k = 0; k < nB; k++) out.push(groupB[bi++]);
  }
  return out;
}
