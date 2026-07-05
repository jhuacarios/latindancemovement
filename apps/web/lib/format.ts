/** Formatea una duración en segundos como "m:ss" (ej: 225 -> "3:45"). */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Formatea una duración total como "X h Y min" (o "Y min"). */
export function formatTotalDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/**
 * Formatea la fecha de lanzamiento: "2024-04-04"/"2024-04" -> "abr 2024";
 * "2024" -> "2024". Si no hay fecha (o es ""), cae al año; si tampoco, "—".
 */
export function formatReleaseDate(
  releaseDate: string | null | undefined,
  year: number | null | undefined,
): string {
  if (releaseDate) {
    const ym = /^(\d{4})-(\d{2})/.exec(releaseDate);
    if (ym) {
      const mi = Number(ym[2]) - 1;
      if (mi >= 0 && mi < 12) return `${MESES[mi]} ${ym[1]}`;
    }
    if (/^\d{4}$/.test(releaseDate)) return releaseDate;
  }
  return year != null ? String(year) : '—';
}

/**
 * ¿La canción se lanzó hace 2 meses o menos? Solo cuenta si la fecha tiene al
 * menos mes ("2024-04" / "2024-04-15"); las de solo año no se pueden ubicar.
 */
export function isNewRelease(releaseDate: string | null | undefined): boolean {
  if (!releaseDate) return false;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(releaseDate);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  return d >= cutoff;
}

/** Convierte una fecha de lanzamiento/año a Date (año-solo → 1 de enero). */
export function releaseDateToDate(
  releaseDate: string | null | undefined,
  year: number | null | undefined,
): Date | null {
  if (releaseDate) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(releaseDate);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
    }
    if (/^\d{4}$/.test(releaseDate)) return new Date(Number(releaseDate), 0, 1);
  }
  return year != null ? new Date(year, 0, 1) : null;
}

/** ¿La canción es de los últimos `months` meses? months<=0 → sin filtro (true). */
export function isWithinLastMonths(
  releaseDate: string | null | undefined,
  year: number | null | undefined,
  months: number,
): boolean {
  if (!months || months <= 0) return true;
  const d = releaseDateToDate(releaseDate, year);
  if (!d) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return d >= cutoff;
}

/** Reproducciones compactas: 1.2M, 34K, 980 o "—". */
export function formatViews(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

/**
 * Reproducciones por día desde la fecha de subida (velocidad/popularidad).
 * = viewCount / días desde `uploadDate`. null si falta el dato.
 */
export function viewsPerDay(
  viewCount: string | number | null | undefined,
  uploadDate: string | null | undefined,
): number | null {
  const v = Number(viewCount ?? 0);
  if (!Number.isFinite(v) || v <= 0) return null;
  const d = releaseDateToDate(uploadDate, null);
  if (!d) return null;
  const days = Math.max(1, (Date.now() - d.getTime()) / 86_400_000);
  return v / days;
}

/** Reproducciones/día compactas: "1.2K/d", "340/d" o "—". */
export function formatViewsPerDay(
  viewCount: string | number | null | undefined,
  uploadDate: string | null | undefined,
): string {
  const vpd = viewsPerDay(viewCount, uploadDate);
  return vpd == null ? '—' : `${formatViews(Math.round(vpd))}/d`;
}
