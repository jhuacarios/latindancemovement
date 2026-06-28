import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { DanceStyle, DanceSubstyle } from '@baile-latino/types';

interface StyleGuess {
  style: DanceStyle | null;
  substyle: DanceSubstyle | null;
}

/** Datos de un track de una playlist de Spotify (para matchear con YouTube). */
export interface SpotifyTrackInfo {
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  isrc: string | null;
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
      const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=3`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) this.token = null; // forzar refresh la próxima
        return null;
      }
      const json = (await res.json()) as any;
      const track = json.tracks?.items?.[0];
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
        title: String(t.title ?? '').trim(),
        artist: t.subtitle
          ? String(t.subtitle).split(/[,&]/)[0].trim() || null
          : null,
        durationSec: t.duration ? Math.round(Number(t.duration) / 1000) : null,
        year: null,
        isrc: null,
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

interface EmbedTrack {
  title?: string;
  subtitle?: string;
  duration?: number;
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
