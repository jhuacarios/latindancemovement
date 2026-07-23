/**
 * Limpia el título "crudo" de un video de YouTube para dejar algo cercano al
 * nombre de la canción, quitando la basura habitual: etiquetas entre paréntesis
 * o corchetes ("Official Video", "Audio HD", "Lyric"…), hashtags, años/fechas,
 * "Prod. by …" y segmentos de género/año que van tras "|".
 *
 * No intenta separar artista de canción (eso es ambiguo y no confiable): solo
 * saca el ruido evidente. Si al limpiar quedaría vacío, devuelve el original.
 */

// Palabras de "adorno" que, si aparecen dentro de (...) o [...], hacen que se
// quite ese bloque completo.
const NOISE_WORDS =
  /(official|oficial|video|videoclip|audio|sonido|lyrics?|letra|hd|hq|4k|8k|mv|visualizer|clip|remaster\w*|remasterizad\w*|explicit|explícito|prod\.?\s|by\s|ft\.?\s|feat\.?\s|featuring)/i;

// Palabras que, en un segmento tras "|", indican género/descriptor y no el
// nombre de la canción (se descarta ese segmento).
const SEGMENT_NOISE =
  /(bachata|salsa|sensual|urbana|tradicional|romantic\w*|cover|audio|video|hd|lyric|letra|20\d\d|nueva\s|estreno)/i;

// Hashtags de género/hype: se borran. Los demás (posible nombre) se conservan.
const HASHTAG_NOISE =
  /^(bachata|salsa|sensual|urbana|tradicional|cubana|newmusic|new|music|musica|música|viral|dance|baile|dj|djs|fyp|foryou|foryoupage|nuevo|nueva|estreno|hit|trending|reel|reels|tiktok|shorts?|explore|parati)$/i;

export function cleanTrackTitle(raw: string): string {
  const original = (raw ?? '').trim();
  if (!original) return original;
  let s = original;

  // 1) Quita bloques (…) o […] cuyo contenido es adorno; conserva los que
  //    podrían ser parte del nombre real.
  s = s.replace(/[([]([^)\]]*)[)\]]/g, (whole, inner: string) =>
    NOISE_WORDS.test(inner) ? ' ' : whole,
  );

  // 2) Hashtags: quita los de género/hype (#bachata, #newmusic…) pero conserva
  //    los que parecen ser el nombre (#ChaCha) — solo les saca el "#".
  s = s.replace(/#([\p{L}\p{N}_]+)/gu, (_m, word: string) =>
    HASHTAG_NOISE.test(word) ? ' ' : word,
  );

  // 3) Parte por "|": conserva el primer segmento y descarta los siguientes que
  //    sean género/año/adorno.
  if (s.includes('|')) {
    const parts = s.split('|').map((p) => p.trim());
    s = parts
      .filter((p, i) => i === 0 || (p && !SEGMENT_NOISE.test(p)))
      .join(' | ');
  }

  // 4) Quita años y "Prod. by …" sueltos.
  s = s.replace(/\bprod\.?\s+by\b[^|]*/gi, ' ');
  s = s.replace(/\b(19|20)\d\d\b/g, ' ');

  // 5) Limpia separadores colgando y espacios repetidos.
  s = s
    .replace(/[·•]/g, ' ')
    .replace(/\s*[-–—|]\s*$/g, '')
    .replace(/^\s*[-–—|]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s || original;
}
