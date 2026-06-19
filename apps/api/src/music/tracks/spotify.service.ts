import { Injectable, Logger } from '@nestjs/common';
import type { DanceStyle, DanceSubstyle } from '@baile-latino/types';

interface StyleGuess {
  style: DanceStyle | null;
  substyle: DanceSubstyle | null;
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

  /** Devuelve el estilo/sub-estilo inferido vía Spotify, o null si no se pudo. */
  async detectStyle(title: string, artist: string | null): Promise<StyleGuess | null> {
    if (!this.enabled) return null;
    try {
      const genres = await this.genresForTrack(title, artist);
      if (!genres.length) return null;
      const guess = mapGenresToStyle(genres);
      return guess.style ? guess : null;
    } catch (e) {
      this.logger.warn(
        `Spotify falló para "${title}": ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  private async genresForTrack(
    title: string,
    artist: string | null,
  ): Promise<string[]> {
    const token = await this.getToken();
    const q = encodeURIComponent([title, artist].filter(Boolean).join(' '));
    const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=3`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) this.token = null; // forzar refresh la próxima
      return [];
    }
    const json = (await res.json()) as any;
    const artistId: string | undefined =
      json.tracks?.items?.[0]?.artists?.[0]?.id;
    if (!artistId) return [];
    return this.genresForArtist(artistId, token);
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
