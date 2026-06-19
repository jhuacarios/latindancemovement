import { Injectable, Logger } from '@nestjs/common';
import type { DanceStyle, DanceSubstyle } from '@baile-latino/types';

export interface DiscogsMatch {
  style: DanceStyle | null;
  substyle: DanceSubstyle | null;
  year: number | null;
}

/**
 * Cliente de la API de Discogs. Su campo "Style" es una taxonomía curada
 * (Salsa, Son, Timba, Guaracha, Bachata…) mucho mejor que los géneros de
 * Spotify para música cubana/latina de nicho.
 *
 * Requiere DISCOGS_TOKEN. Sin token, queda deshabilitado (devuelve null).
 */
@Injectable()
export class DiscogsService {
  private readonly logger = new Logger(DiscogsService.name);
  private static readonly UA = 'BaileLatino/1.0 (+https://baile-latino.app)';

  get enabled(): boolean {
    return Boolean(this.authHeader());
  }

  /**
   * Discogs acepta dos formas de auth para búsquedas sin contexto de usuario:
   * un personal access token, o el par consumer key+secret de una app.
   */
  private authHeader(): string | null {
    const token = process.env.DISCOGS_TOKEN;
    if (token) return `Discogs token=${token}`;
    const key = process.env.DISCOGS_CONSUMER_KEY;
    const secret = process.env.DISCOGS_CONSUMER_SECRET;
    if (key && secret) return `Discogs key=${key}, secret=${secret}`;
    return null;
  }

  /**
   * Busca la canción y deriva estilo + sub-estilo del campo "Style".
   * Prueba varias queries (combinada → título → artista), quitando acentos,
   * y devuelve el primer match con estilo. Robusto ante metadata sucia.
   */
  async lookup(title: string, artist: string | null): Promise<DiscogsMatch | null> {
    const auth = this.authHeader();
    if (!auth) return null;
    const candidates = [[artist, title].filter(Boolean).join(' '), title, artist ?? '']
      .map(stripDiacritics)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    try {
      for (const q of candidates) {
        if (seen.has(q)) continue;
        seen.add(q);
        const match = await this.searchOnce(q, auth);
        if (match?.style) return match;
      }
      return null;
    } catch (e) {
      this.logger.warn(
        `Discogs falló para "${title}": ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  private async searchOnce(q: string, auth: string): Promise<DiscogsMatch | null> {
    const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(q)}&type=release&per_page=5`;
    const res = await fetch(url, {
      headers: { Authorization: auth, 'User-Agent': DiscogsService.UA },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const results: any[] = json.results ?? [];
    for (const r of results) {
      const styles: string[] = Array.isArray(r.style) ? r.style : [];
      const guess = mapDiscogsStyles(styles);
      if (guess.style) return { ...guess, year: parseYear(r.year) };
    }
    return null;
  }
}

/** Quita tildes/diacríticos para que la búsqueda no falle por acentos. */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseYear(year?: string | number): number | null {
  if (year == null) return null;
  const y = Number(String(year).slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

/** Estilos cubanos de Discogs que implican salsa cubana. */
const DISCOGS_CUBAN = [
  'timba',
  'son',
  'son montuno',
  'son cubano',
  'cubano',
  'afro-cuban',
  'guaracha',
  'charanga',
  'songo',
  'descarga',
  'guajira',
  'rumba',
  'danzón',
  'danzon',
];
/** Estilos de Discogs que cuentan como salsa (incluye los cubanos + mambo). */
const DISCOGS_SALSA = ['salsa', 'mambo', ...DISCOGS_CUBAN];

/** Mapea el array "Style" de Discogs a estilo + sub-estilo de baile. */
export function mapDiscogsStyles(styles: string[]): {
  style: DanceStyle | null;
  substyle: DanceSubstyle | null;
} {
  const set = styles.map((s) => s.toLowerCase().trim());
  const has = (list: string[]) => set.some((s) => list.includes(s));

  if (set.some((s) => s.includes('bachata'))) {
    return { style: 'BACHATA', substyle: null };
  }
  if (has(DISCOGS_SALSA)) {
    return { style: 'SALSA', substyle: has(DISCOGS_CUBAN) ? 'SALSA_CUBANA' : null };
  }
  return { style: null, substyle: null };
}
