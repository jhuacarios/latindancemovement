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
    return Boolean(process.env.DISCOGS_TOKEN);
  }

  /** Busca la canción y deriva estilo + sub-estilo del campo "Style". */
  async lookup(title: string, artist: string | null): Promise<DiscogsMatch | null> {
    if (!this.enabled) return null;
    try {
      const token = process.env.DISCOGS_TOKEN as string;
      const q = encodeURIComponent([artist, title].filter(Boolean).join(' '));
      const url = `https://api.discogs.com/database/search?q=${q}&type=release&per_page=5`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Discogs token=${token}`,
          'User-Agent': DiscogsService.UA,
        },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as any;
      const results: any[] = json.results ?? [];
      // Tomamos el primer resultado cuyo "style" mapee a un estilo de baile.
      for (const r of results) {
        const styles: string[] = Array.isArray(r.style) ? r.style : [];
        const guess = mapDiscogsStyles(styles);
        if (guess.style) {
          return { ...guess, year: parseYear(r.year) };
        }
      }
      return null;
    } catch (e) {
      this.logger.warn(
        `Discogs falló para "${title}": ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }
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
