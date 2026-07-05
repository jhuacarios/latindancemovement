export const MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const NOW = new Date();
export const CUR_YEAR = NOW.getFullYear();
export const CUR_MONTH = NOW.getMonth() + 1; // 1-12

/**
 * Meses disponibles (1..N) según el año: año actual → hasta el mes actual (no
 * hay lanzamientos en el futuro); años pasados → los 12.
 */
export function maxMonthFor(yearStr: string): number {
  if (!/^\d{4}$/.test(yearStr)) return 12;
  return Number(yearStr) === CUR_YEAR ? CUR_MONTH : 12;
}

/** Descompone "YYYY-MM-DD"/"YYYY-MM"/"YYYY" en { month: "MM"|"", year: "YYYY"|"" }. */
export function splitReleaseDate(rd: string | null | undefined): {
  month: string;
  year: string;
} {
  if (!rd) return { month: '', year: '' };
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(rd);
  if (!m) return { month: '', year: '' };
  return { year: m[1], month: m[2] ?? '' };
}
