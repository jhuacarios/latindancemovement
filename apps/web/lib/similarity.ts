/**
 * Detección de canciones (casi) duplicadas por título/artista. Se usa para
 * avisar en la playlist cuando hay repetidas o muy parecidas.
 */

/** Normaliza para comparar: minúsculas, sin acentos, sin adornos ni puntuación. */
export function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(feat[^)]*\)|\bfeat\.?\b|\bft\.?\b/g, ' ')
    .replace(
      /\b(official|oficial|video|videoclip|audio|lyric|lyrics|letra|hd|4k|mv|version|en vivo|live)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similitud 0..1 entre dos strings (Levenshtein normalizado por el más largo). */
export function similarityRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

export interface MatchTrack {
  sourceId?: string | null;
  title?: string | null;
  artist?: string | null;
}

/**
 * ¿Los artistas son compatibles? Iguales, uno contiene al otro (ej. uno trae el
 * feat y el otro no: "Romeo Santos, Prince Royce" vs "Romeo Santos"), o muy
 * parecidos (≥0.6). Si falta alguno, se consideran compatibles.
 */
function artistCompatible(aa: string, ab: string): boolean {
  if (!aa || !ab) return true;
  if (aa === ab) return true;
  const [short, long] = aa.length <= ab.length ? [aa, ab] : [ab, aa];
  if (short.length >= 4 && long.includes(short)) return true;
  return similarityRatio(aa, ab) >= 0.6;
}

/**
 * ¿Son (casi) la misma canción? Verdadero si es el mismo video, o si el título
 * es muy parecido (≥0.85) con artista compatible.
 */
export function areSimilarTracks(a: MatchTrack, b: MatchTrack): boolean {
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true;
  const ta = normalizeForMatch(a.title);
  const tb = normalizeForMatch(b.title);
  if (!ta || !tb) return false;
  if (similarityRatio(ta, tb) < 0.85) return false;
  return artistCompatible(normalizeForMatch(a.artist), normalizeForMatch(b.artist));
}

export interface EpicRef {
  title?: string | null;
  artist?: string | null;
  style?: string | null;
  durationSec?: number | null;
}

/**
 * Matcher para "heredar" la marca de Épica entre plataformas (ej. Spotify hereda
 * de YouTube, que sí tiene reproducciones). Es **estricto** para no marcar de
 * más: exige título+artista muy parecidos (`areSimilarTracks`), **mismo estilo**
 * y **duración casi idéntica** (±`maxDiffSec`). Si a alguno le falta la duración,
 * no se hereda (mejor perder una que marcar la equivocada).
 */
export function buildEpicMatcher(
  refs: EpicRef[],
  maxDiffSec = 5,
): (t: EpicRef) => boolean {
  return (t) =>
    refs.some((c) => {
      if (t.style && c.style && t.style !== c.style) return false;
      if (
        typeof t.durationSec !== 'number' ||
        typeof c.durationSec !== 'number' ||
        Math.abs(t.durationSec - c.durationSec) > maxDiffSec
      ) {
        return false;
      }
      return areSimilarTracks(t, c);
    });
}
