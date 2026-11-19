// ---------------------------------------------------------------------------
// Cumpleaños: solo día y mes (sin año, a propósito: no pedimos la edad).
// ---------------------------------------------------------------------------

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/** Días de cada mes (febrero con 29: sin año, el 29 de febrero vale). */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** `null` si es válido (o vacío); si no, el motivo en español. */
export function birthdayError(
  day: number | null | undefined,
  month: number | null | undefined,
): string | null {
  const d = day ?? null;
  const m = month ?? null;
  if (d == null && m == null) return null;
  if (d == null || m == null) return 'Indica el día y el mes.';
  if (!Number.isInteger(m) || m < 1 || m > 12) return 'El mes no es válido.';
  if (!Number.isInteger(d) || d < 1 || d > DAYS_IN_MONTH[m - 1]) {
    return `Ese día no existe en ${MONTH_NAMES[m - 1]}.`;
  }
  return null;
}

/** "14 de febrero". */
export function birthdayLabel(day: number, month: number): string {
  return `${day} de ${MONTH_NAMES[month - 1]}`;
}
