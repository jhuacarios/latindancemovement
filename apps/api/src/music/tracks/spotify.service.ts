import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { DanceStyle, DanceSubstyle } from '@baile-latino/types';

interface StyleGuess {
  style: DanceStyle | null;
  substyle: DanceSubstyle | null;
}

/** Datos de un track de una playlist de Spotify (para matchear con YouTube). */
export interface SpotifyTrackInfo {
  /** ID del track (extraído del `uri` del embed). null si no venía. */
  sourceId: string | null;
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  isrc: string | null;
  /** ¿Reproducible en el embed? false = restringida; null = desconocido. */
  playable: boolean | null;
}

/** Track resuelto de una playlist de Spotify (para importar al catálogo Spotify). */
export interface SpotifyResolvedTrack {
  source: 'SPOTIFY';
  sourceId: string;
  url: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  coverUrl: string | null;
  detectedStyle: DanceStyle | null;
  detectedSubstyle: DanceSubstyle | null;
  /** ¿Reproducible en el embed? false = restringida en la región; null = desconocido. */
  playable: boolean | null;
  /** Fecha de lanzamiento completa "YYYY-MM-DD" (del embed), o null. */
  releaseDate: string | null;
}

/** Metadata de un track de Spotify para autocompletar al agregarlo. */
export interface SpotifyTrackMeta {
  source: 'SPOTIFY';
  sourceId: string;
  url: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  coverUrl: string | null;
  detectedStyle: DanceStyle | null;
  detectedSubstyle: DanceSubstyle | null;
}

/** Resultado de buscar un track en Spotify: estilo inferido + año real del álbum. */
export interface SpotifyMatch {
  style: DanceStyle | null;
  substyle: DanceSubstyle | null;
  /** Año de lanzamiento real (de `album.release_date`), no el de subida a YouTube. */
  year: number | null;
}

/**
 * Cliente liviano de la Spotify Web API (flujo client-credentials).
 * Se usa como fuente autoritativa de género: busca el track por
 * título+artista y lee los géneros del artista para inferir el estilo.
 *
 * Si no hay credenciales configuradas (SPOTIFY_CLIENT_ID/SECRET), el
 * servicio queda deshabilitado y todos los métodos devuelven null —
 * la detección cae entonces a las señales de YouTube.
 */
@Injectable()
export class SpotifyService {
  private readonly logger = new Logger(SpotifyService.name);
  private token: { value: string; expiresAt: number } | null = null;
  /** Cache de géneros por artistId durante el proceso (evita refetch del mismo artista). */
  private readonly artistGenres = new Map<string, string[]>();

  get enabled(): boolean {
    return Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET,
    );
  }

  /**
   * Busca el track en Spotify y devuelve estilo (de los géneros del artista)
   * + año real (del álbum), o null si no hay match / Spotify deshabilitado.
   */
  async lookup(title: string, artist: string | null): Promise<SpotifyMatch | null> {
    if (!this.enabled) return null;
    try {
      const token = await this.getToken();
      const q = encodeURIComponent([title, artist].filter(Boolean).join(' '));
      const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) this.token = null; // forzar refresh la próxima
        return null;
      }
      const json = (await res.json()) as any;
      // Exige que el artista coincida: evita años/estilos de otra canción con el
      // mismo título (ej. "Estambul" de 1979 de otro artista).
      const track = pickByArtist(json.tracks?.items ?? [], artist);
      if (!track) return null;

      const year = parseYear(track.album?.release_date);
      const artistId: string | undefined = track.artists?.[0]?.id;
      let guess: StyleGuess = { style: null, substyle: null };
      if (artistId) {
        const genres = await this.genresForArtist(artistId, token);
        if (genres.length) guess = mapGenresToStyle(genres);
      }
      return { style: guess.style, substyle: guess.substyle, year };
    } catch (e) {
      this.logger.warn(
        `Spotify falló para "${title}": ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  /**
   * Lee la metadata de un track de Spotify por su link (para autocompletar al
   * agregar a Mis Canciones / Catálogo). `GET /v1/tracks/{id}` SÍ funciona con
   * token client-credentials (a diferencia de las playlists). Incluye estilo
   * inferido por los géneros del artista.
   */
  async getTrackByLink(link: string): Promise<SpotifyTrackMeta> {
    if (!this.enabled) {
      throw new BadRequestException('Spotify no está configurado en el servidor.');
    }
    const id = parseTrackId(link);
    if (!id) {
      throw new BadRequestException(
        'No se reconoció un track de Spotify en el link.',
      );
    }
    const token = await this.getToken();
    const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) this.token = null;
      throw new BadRequestException('No se pudo leer el track de Spotify.');
    }
    const t = (await res.json()) as any;
    const artist: string | null =
      (t.artists ?? []).map((a: any) => a.name).filter(Boolean).join(', ') ||
      null;
    let guess: StyleGuess = { style: null, substyle: null };
    const artistId: string | undefined = t.artists?.[0]?.id;
    if (artistId) {
      const genres = await this.genresForArtist(artistId, token);
      if (genres.length) guess = mapGenresToStyle(genres);
    }
    return {
      source: 'SPOTIFY',
      sourceId: id,
      url: `https://open.spotify.com/track/${id}`,
      title: t.name ?? '',
      artist,
      durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
      year: parseYear(t.album?.release_date),
      coverUrl: t.album?.images?.[0]?.url ?? null,
      detectedStyle: guess.style,
      detectedSubstyle: guess.substyle,
    };
  }

  /**
   * Lee del embed público de un track su reproducibilidad (`isPlayable`) y su
   * carátula (`coverArt`). El embed no tiene rate limit como la Web API, así que
   * es la fuente confiable para importar/mostrar. null si no se pudo determinar.
   */
  async getTrackEmbedInfo(id: string): Promise<{
    playable: boolean | null;
    coverUrl: string | null;
    year: number | null;
    releaseDate: string | null;
  }> {
    const none = {
      playable: null,
      coverUrl: null,
      year: null,
      releaseDate: null,
    };
    if (!id) return none;
    try {
      const res = await fetch(`https://open.spotify.com/embed/track/${id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) return none;
      const html = await res.text();
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      if (!m) return none;
      const e = (JSON.parse(m[1]) as any)?.props?.pageProps?.state?.data
        ?.entity;
      const playable =
        typeof e?.isPlayable === 'boolean' ? e.isPlayable : null;
      // La carátula viene en `visualIdentity.image` (algunos embeds usan
      // `coverArt.sources`); es un array de {url, maxWidth, maxHeight}.
      const img = e?.visualIdentity?.image ?? e?.coverArt?.sources;
      const coverUrl =
        Array.isArray(img) && img.length ? (img[0]?.url ?? null) : null;
      const iso = e?.releaseDate?.isoString;
      const year = typeof iso === 'string' ? parseYear(iso) : null;
      // Fecha completa "YYYY-MM-DD" (para el mes en la columna Fecha).
      const releaseDate =
        typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso)
          ? iso.slice(0, 10)
          : null;
      return { playable, coverUrl, year, releaseDate };
    } catch {
      return none;
    }
  }

  /** ¿El track es reproducible en el embed? false = restringida por país/licencia. */
  async getPlayableById(id: string): Promise<boolean | null> {
    return (await this.getTrackEmbedInfo(id)).playable;
  }

  /**
   * `album.release_date` de un track de Spotify por su ID ("2024-04-04" |
   * "2024-04" | "2024"). `GET /v1/tracks/{id}` funciona con client-credentials
   * (a diferencia del lote `?ids=`). null si no hay o falla.
   */
  async getReleaseDateById(id: string): Promise<string | null> {
    if (!this.enabled || !id) return null;
    try {
      const token = await this.getToken();
      const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) this.token = null;
        return null;
      }
      const t = (await res.json()) as any;
      return t.album?.release_date ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Busca un track por título+artista y devuelve el `release_date` de su álbum
   * (con la precisión que dé Spotify), o null si no hay match / falla.
   */
  async searchReleaseDate(
    title: string,
    artist: string | null,
  ): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const token = await this.getToken();
      const q = encodeURIComponent([title, artist].filter(Boolean).join(' '));
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        if (res.status === 401) this.token = null;
        return null;
      }
      // Solo acepta la fecha si el artista coincide (evita match por título).
      const track = pickByArtist(((await res.json()) as any).tracks?.items ?? [], artist);
      return track?.album?.release_date ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Nombre + descripción de una playlist (para inferir estilo por su nombre,
   * ej: "Bachata casual"). Vía Web API con token client-credentials (la metadata
   * sí se puede leer, a diferencia de las canciones). null si falla.
   */
  async getPlaylistName(link: string): Promise<string | null> {
    if (!this.enabled) return null;
    const id = parsePlaylistId(link);
    if (!id) return null;
    try {
      const token = await this.getToken();
      const res = await fetch(
        `https://api.spotify.com/v1/playlists/${id}?fields=name,description`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        if (res.status === 401) this.token = null;
        return null;
      }
      const j = (await res.json()) as { name?: string; description?: string };
      return [j.name, j.description].filter(Boolean).join(' ') || null;
    } catch {
      return null;
    }
  }

  /**
   * Lee una playlist pública de Spotify y resuelve cada canción. El embed ya
   * trae el ID real (del `uri`), título, artista y duración — se usan tal cual
   * (así no dependemos de que una búsqueda por título acierte). Enriquecemos
   * año, carátula y estilo con la Web API en modo best-effort: si esa llamada
   * falla (p. ej. rate limit), la canción igual se importa con lo del embed.
   * Deduplica por sourceId. Para importar una playlist al catálogo de Spotify.
   */
  async getPlaylistResolved(link: string): Promise<SpotifyResolvedTrack[]> {
    if (!this.enabled) {
      throw new BadRequestException('Spotify no está configurado en el servidor.');
    }
    const embed = await this.getPlaylistTracks(link);
    const token = await this.getToken();
    const out: SpotifyResolvedTrack[] = [];
    const seen = new Set<string>();
    for (const e of embed) {
      const id = e.sourceId;
      if (!id || seen.has(id)) continue;
      seen.add(id);

      // Carátula, año y reproducibilidad desde el embed (confiable, sin rate limit).
      const info = await this.getTrackEmbedInfo(id);
      let year = info.year ?? e.year;
      let coverUrl = info.coverUrl;
      let guess: StyleGuess = { style: null, substyle: null };
      // Best-effort por la Web API para año y estilo (géneros del artista). Si
      // da rate limit u otro error, se importa igual con lo del embed.
      try {
        const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const t = (await res.json()) as any;
          year = parseYear(t.album?.release_date) ?? year;
          coverUrl = coverUrl ?? t.album?.images?.[0]?.url ?? null;
          const artistId: string | undefined = t.artists?.[0]?.id;
          if (artistId) {
            const genres = await this.genresForArtist(artistId, token);
            if (genres.length) guess = mapGenresToStyle(genres);
          }
        } else if (res.status === 401) {
          this.token = null;
        }
      } catch {
        /* sin detalle: se usa lo del embed */
      }

      out.push({
        source: 'SPOTIFY',
        sourceId: id,
        url: `https://open.spotify.com/track/${id}`,
        title: e.title,
        artist: e.artist,
        durationSec: e.durationSec,
        year,
        coverUrl,
        detectedStyle: guess.style,
        detectedSubstyle: guess.substyle,
        playable: info.playable ?? e.playable,
        releaseDate: info.releaseDate,
      });
    }
    return out;
  }

  /**
   * Lee los tracks de una playlist pública de Spotify desde el **embed** público
   * (`open.spotify.com/embed/playlist/{id}`), no desde la Web API: Spotify
   * bloqueó la lectura de canciones de playlists con tokens client-credentials
   * (cambio de su API, fines de 2024). El embed no requiere auth y trae
   * título/artista/duración — suficiente para matchear con YouTube.
   */
  async getPlaylistTracks(link: string): Promise<SpotifyTrackInfo[]> {
    const id = parsePlaylistId(link);
    if (!id) {
      throw new BadRequestException(
        'No se reconoció una playlist de Spotify en el link.',
      );
    }
    const res = await fetch(
      `https://open.spotify.com/embed/playlist/${id}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!res.ok) {
      throw new BadRequestException(
        'No se pudo leer la playlist de Spotify (¿es pública?).',
      );
    }
    const html = await res.text();
    const m = html.match(
      /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
    );
    if (!m) {
      throw new BadRequestException(
        'No se pudo leer la playlist de Spotify (formato inesperado).',
      );
    }
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      throw new BadRequestException(
        'No se pudo interpretar la playlist de Spotify.',
      );
    }
    const list = findTrackList(data);
    if (!list || !list.length) {
      throw new BadRequestException('La playlist está vacía o no es pública.');
    }
    return list
      .map((t) => ({
        sourceId: t.uri ? parseTrackId(t.uri) : null,
        title: String(t.title ?? '').trim(),
        artist: t.subtitle
          ? String(t.subtitle).split(/[,&]/)[0].trim() || null
          : null,
        durationSec: t.duration ? Math.round(Number(t.duration) / 1000) : null,
        year: null,
        isrc: null,
        playable: typeof t.isPlayable === 'boolean' ? t.isPlayable : null,
      }))
      .filter((t) => t.title);
  }

  private async genresForArtist(artistId: string, token: string): Promise<string[]> {
    const cached = this.artistGenres.get(artistId);
    if (cached) return cached;
    const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const genres: string[] = Array.isArray(json.genres) ? json.genres : [];
    this.artistGenres.set(artistId, genres);
    return genres;
  }

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 5000) {
      return this.token.value;
    }
    const creds = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
    ).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      throw new Error(`token ${res.status}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = {
      value: json.access_token,
      expiresAt: now + json.expires_in * 1000,
    };
    return this.token.value;
  }
}

/** Extrae el id de una playlist de Spotify (link web o URI). */
function parsePlaylistId(link: string): string | null {
  const m = link.match(/playlist[/:]([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

/** Extrae el id de un track de Spotify (link web o URI). */
function parseTrackId(link: string): string | null {
  const m = link.match(/track[/:]([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

/** Normaliza un nombre de artista para comparar (sin acentos, sin feats, minúsculas). */
function normArtist(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(feat|ft|featuring|con)\b.*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * ¿El artista de la búsqueda coincide con alguno del track de Spotify? Evita
 * matches falsos por título repetido (ej. "Estambul" de 1979 de otro artista).
 * Compara el artista principal (antes de coma/&) de forma laxa (contención).
 */
function artistLooseMatch(
  queryArtist: string | null,
  names: (string | null | undefined)[],
): boolean {
  const q = normArtist((queryArtist ?? '').split(/[,&]/)[0]);
  if (q.length < 3) return false; // muy corto: no arriesgar falso positivo
  return names.some((n) => {
    const x = normArtist(n);
    return x.length >= 3 && (x === q || x.includes(q) || q.includes(x));
  });
}

/** De los resultados de búsqueda, elige el primero cuyo artista coincida. */
function pickByArtist(items: any[], artist: string | null): any | null {
  if (!artist) return items[0] ?? null;
  const hit = items.find((t) =>
    artistLooseMatch(artist, (t.artists ?? []).map((a: any) => a.name)),
  );
  return hit ?? null; // sin coincidencia de artista: no matchear (año/estilo dudosos)
}

interface EmbedTrack {
  uri?: string;
  title?: string;
  subtitle?: string;
  duration?: number;
  isPlayable?: boolean;
}

/** Busca recursivamente el array `trackList` dentro del JSON del embed. */
function findTrackList(o: unknown): EmbedTrack[] | null {
  if (Array.isArray(o)) {
    for (const v of o) {
      const r = findTrackList(v);
      if (r) return r;
    }
    return null;
  }
  if (o && typeof o === 'object') {
    const rec = o as Record<string, unknown>;
    if (Array.isArray(rec.trackList)) return rec.trackList as EmbedTrack[];
    for (const v of Object.values(rec)) {
      const r = findTrackList(v);
      if (r) return r;
    }
  }
  return null;
}

/** "2021-05-10" | "2021-05" | "2021" -> 2021 (o null si no es válido). */
function parseYear(releaseDate?: string): number | null {
  if (!releaseDate) return null;
  const y = Number(String(releaseDate).slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

/** Mapea una lista de géneros de Spotify a estilo + sub-estilo de baile. */
export function mapGenresToStyle(genres: string[]): StyleGuess {
  const g = genres.join(' ').toLowerCase();

  if (g.includes('bachata')) {
    let substyle: DanceSubstyle | null = null;
    if (g.includes('sensual')) substyle = 'BACHATA_SENSUAL';
    else if (g.includes('urban')) substyle = 'BACHATA_URBANA';
    else if (g.includes('dominican') || g.includes('tradicional'))
      substyle = 'BACHATA_TRADICIONAL';
    return { style: 'BACHATA', substyle };
  }

  const isSalsa =
    g.includes('salsa') ||
    g.includes('timba') ||
    g.includes('son cubano') ||
    g.includes('son montuno') ||
    g.includes('guaracha') ||
    g.includes('songo') ||
    g.includes('rumba') ||
    g.includes('cuban');
  if (isSalsa) {
    let substyle: DanceSubstyle | null = null;
    if (
      g.includes('timba') ||
      g.includes('cubana') ||
      g.includes('cuban') ||
      g.includes('casino') ||
      g.includes('songo') ||
      g.includes('guaracha') ||
      g.includes('son ')
    )
      substyle = 'SALSA_CUBANA';
    else if (g.includes('on2') || g.includes('mambo') || g.includes('nuyorican'))
      substyle = 'SALSA_ON2';
    else if (g.includes('on1')) substyle = 'SALSA_ON1';
    return { style: 'SALSA', substyle };
  }

  return { style: null, substyle: null };
}
