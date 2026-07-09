import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import type {
  SpotifyOwnPlaylist,
  SpotifyPlaylistDetail,
  SpotifyPlaylistStats,
  SpotifyPlaylistTrackItem,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';
import { TracksService } from '../tracks/tracks.service';
import { PlaylistsService } from '../playlists/playlists.service';

/**
 * Scopes: leer playlists del usuario y CREARLAS (para exportar una playlist
 * interna a Spotify). Si amplías scopes, el usuario debe reconectar su cuenta.
 */
const SCOPE =
  'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-read-email user-read-private';

const refreshKey = (userId: string) => `sp_refresh:${userId}`;
const stateKey = (state: string) => `sp_state:${state}`;

/**
 * OAuth de Spotify (Authorization Code) para leer las playlists de la cuenta del
 * usuario. Con token de usuario SÍ se pueden leer las canciones de las playlists
 * (a diferencia del token client-credentials, que Spotify bloqueó).
 */
@Injectable()
export class SpotifyOAuthService {
  private readonly logger = new Logger(SpotifyOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracks: TracksService,
    private readonly playlists: PlaylistsService,
  ) {}

  /**
   * Crea una playlist en la cuenta de Spotify del usuario con las canciones (de
   * Spotify) de una playlist interna. Snapshot: no se sincroniza. Requiere el
   * scope playlist-modify (reconectar si la conexión es vieja).
   */
  async createFromInternal(
    userId: string,
    playlistId: string,
    title: string | undefined,
    isPublic: boolean,
  ): Promise<{ playlistId: string; url: string; added: number; skipped: number }> {
    const pl = await this.playlists.findOne(playlistId);
    if (pl.ownerId !== userId) {
      throw new ForbiddenException('Esta playlist no es tuya.');
    }
    const items = pl.items ?? [];
    const uris = items
      .filter((i) => i.track?.source === 'SPOTIFY' && i.track.sourceId)
      .map((i) => `spotify:track:${i.track!.sourceId}`);
    const skipped = items.length - uris.length;
    if (!uris.length) {
      throw new BadRequestException(
        'La playlist no tiene canciones de Spotify para exportar.',
      );
    }

    const token = await this.accessToken(userId);
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      throw new BadRequestException('No se pudo leer tu cuenta de Spotify.');
    }
    const meId = ((await meRes.json()) as { id: string }).id;

    const createRes = await fetch(
      `https://api.spotify.com/v1/users/${encodeURIComponent(meId)}/playlists`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: title?.trim() || `${pl.name} — Nectason`,
          public: isPublic,
          description: `Generada desde "${pl.name}" en Nectason (snapshot).`,
        }),
      },
    );
    if (!createRes.ok) {
      const body = await createRes.text();
      if (createRes.status === 403) {
        // Token con scope correcto pero Spotify bloquea la escritura: la app está
        // en "modo desarrollo" y tu cuenta no está en "User Management".
        throw new BadRequestException(
          'Spotify rechazó crear la playlist (403). Tu app de Spotify está en ' +
            'modo desarrollo: agrega tu cuenta en el dashboard de Spotify → tu ' +
            'app → User Management (o pide "Extended Quota Mode"). No es un ' +
            'problema de permisos ni de Nectason.',
        );
      }
      throw new BadRequestException(
        `No se pudo crear la playlist en Spotify: ${body}`,
      );
    }
    const created = (await createRes.json()) as {
      id: string;
      external_urls?: { spotify?: string };
    };

    // Agrega en lotes de 100 (límite de la API).
    for (let i = 0; i < uris.length; i += 100) {
      const batch = uris.slice(i, i + 100);
      const addRes = await fetch(
        `https://api.spotify.com/v1/playlists/${created.id}/tracks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: batch }),
        },
      );
      if (!addRes.ok) {
        this.logger.warn(
          `No se pudo agregar un lote a la playlist: ${await addRes.text()}`,
        );
      }
    }

    return {
      playlistId: created.id,
      url:
        created.external_urls?.spotify ??
        `https://open.spotify.com/playlist/${created.id}`,
      added: uris.length,
      skipped,
    };
  }

  get configured(): boolean {
    return Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET,
    );
  }

  private get clientId(): string {
    return process.env.SPOTIFY_CLIENT_ID as string;
  }
  private get clientSecret(): string {
    return process.env.SPOTIFY_CLIENT_SECRET as string;
  }
  private redirectUri(): string {
    return (
      process.env.SPOTIFY_OAUTH_REDIRECT_URI ??
      'http://localhost:3000/api/v1/music/spotify/callback'
    );
  }
  private basicAuth(): string {
    return Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64',
    );
  }

  // --- OAuth ----------------------------------------------------------------
  async buildAuthUrl(userId: string): Promise<string> {
    if (!this.configured) {
      throw new BadRequestException(
        'Falta configurar SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET.',
      );
    }
    const state = randomBytes(16).toString('hex');
    await this.prisma.setting.upsert({
      where: { key: stateKey(state) },
      create: { key: stateKey(state), value: userId },
      update: { value: userId },
    });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: SCOPE,
      redirect_uri: this.redirectUri(),
      state,
      // Fuerza el diálogo de consentimiento: si el usuario ya autorizó con
      // scopes viejos, Spotify no re-pregunta y el token no incluiría los
      // nuevos permisos (crear playlists). Con esto siempre otorga los scopes.
      show_dialog: 'true',
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const row = await this.prisma.setting.findUnique({
      where: { key: stateKey(state) },
    });
    if (!row) throw new BadRequestException('State inválido o expirado.');
    const userId = row.value;
    await this.prisma.setting
      .delete({ where: { key: stateKey(state) } })
      .catch(() => undefined);

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      }).toString(),
    });
    if (!res.ok) {
      throw new BadRequestException(
        `Spotify rechazó el intercambio: ${await res.text()}`,
      );
    }
    const json = (await res.json()) as { refresh_token?: string };
    if (!json.refresh_token) {
      throw new BadRequestException('Spotify no devolvió refresh_token.');
    }
    await this.prisma.setting.upsert({
      where: { key: refreshKey(userId) },
      create: { key: refreshKey(userId), value: json.refresh_token },
      update: { value: json.refresh_token },
    });
  }

  /** Datos de la cuenta de Spotify conectada (para saber qué email habilitar). */
  async getMe(
    userId: string,
  ): Promise<{ id: string; displayName: string | null; email: string | null; product: string | null }> {
    const token = await this.accessToken(userId);
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new BadRequestException('No se pudo leer tu cuenta de Spotify.');
    }
    const me = (await res.json()) as {
      id: string;
      display_name?: string;
      email?: string;
      product?: string;
    };
    return {
      id: me.id,
      displayName: me.display_name ?? null,
      email: me.email ?? null,
      product: me.product ?? null,
    };
  }

  async isConnected(userId: string): Promise<boolean> {
    const row = await this.prisma.setting.findUnique({
      where: { key: refreshKey(userId) },
    });
    return Boolean(row?.value);
  }

  async disconnect(userId: string): Promise<void> {
    await this.prisma.setting
      .delete({ where: { key: refreshKey(userId) } })
      .catch(() => undefined);
  }

  private async accessToken(userId: string): Promise<string> {
    const row = await this.prisma.setting.findUnique({
      where: { key: refreshKey(userId) },
    });
    if (!row?.value) {
      throw new BadRequestException('Conecta tu cuenta de Spotify primero.');
    }
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.value,
      }).toString(),
    });
    if (!res.ok) {
      await this.disconnect(userId);
      throw new BadRequestException(
        'La conexión con Spotify expiró. Vuelve a conectar tu cuenta.',
      );
    }
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  // --- Playlists ------------------------------------------------------------
  async listMyPlaylists(userId: string): Promise<SpotifyOwnPlaylist[]> {
    const token = await this.accessToken(userId);
    const out: SpotifyOwnPlaylist[] = [];
    let url: string | null =
      'https://api.spotify.com/v1/me/playlists?limit=50';
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new BadRequestException(
          `No se pudieron traer tus playlists de Spotify: ${await res.text()}`,
        );
      }
      const json = (await res.json()) as {
        items?: any[];
        next?: string | null;
      };
      for (const it of json.items ?? []) {
        if (it?.id) out.push(this.mapPlaylist(it));
      }
      url = json.next ?? null;
    }
    return out;
  }

  private mapPlaylist(it: any): SpotifyOwnPlaylist {
    // El conteo viene en `tracks.total`; algunas respuestas de /me/playlists lo
    // traen en `items.total` (o `items` como arreglo). Contemplar ambos.
    const itemCount =
      it.tracks?.total ??
      it.items?.total ??
      (Array.isArray(it.items) ? it.items.length : 0);
    return {
      id: it.id,
      name: it.name ?? '(sin título)',
      description: it.description ?? '',
      itemCount,
      imageUrl: it.images?.[0]?.url ?? null,
      owner: it.owner?.display_name ?? it.owner?.id ?? '',
      url: it.external_urls?.spotify ?? `https://open.spotify.com/playlist/${it.id}`,
    };
  }

  /**
   * Traduce una respuesta fallida de la API de Spotify a un error legible: rate
   * limit (429) → mensaje claro (la UI lo detecta por "límite/rate"); otro
   * motivo → BadRequest con `fallback` (sin volcar el JSON crudo de Spotify).
   */
  private async spotifyFail(res: Response, fallback: string): Promise<never> {
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '');
      const secs = Number.isFinite(retry) && retry > 0 ? ` (~${retry}s)` : '';
      throw new ServiceUnavailableException(
        `Spotify limitó las solicitudes por un momento${secs} (rate limit). ` +
          'Espera unos segundos y reintenta.',
      );
    }
    const body = await res.text().catch(() => '');
    this.logger.warn(
      `Spotify API ${res.status} ${res.statusText} @ ${res.url}: ${body.slice(0, 600)}`,
    );
    // Spotify bloquea el acceso vía API a ciertas playlists (las generadas por
    // Spotify —Daily Mix, Descubrimiento, Radar, Blends— y algunas restringidas
    // de terceros): metadata carga pero /tracks devuelve 403/404. No es un bug
    // nuestro ni de permisos; es una restricción de Spotify.
    if (res.status === 403 || res.status === 404) {
      throw new BadRequestException(
        'Spotify no permite leer las canciones de esta playlist desde la API. ' +
          'Suele pasar con playlists generadas por Spotify (Daily Mix, ' +
          'Descubrimiento Semanal, Radar, Blends) o restringidas. Prueba con una ' +
          'playlist creada por ti.',
      );
    }
    throw new BadRequestException(fallback);
  }

  async getPlaylistDetail(
    userId: string,
    playlistId: string,
  ): Promise<SpotifyPlaylistDetail> {
    const token = await this.accessToken(userId);

    // Metadatos.
    const metaRes = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?fields=id,name,description,images,owner(display_name,id),external_urls,tracks(total)`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!metaRes.ok) {
      await this.spotifyFail(metaRes, 'No se pudo leer la playlist.');
    }
    const meta = this.mapPlaylist(await metaRes.json());

    // Canciones (paginando).
    const items: SpotifyPlaylistTrackItem[] = [];
    let url: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await this.spotifyFail(
          res,
          'No se pudieron leer las canciones de la playlist.',
        );
      }
      const json = (await res.json()) as {
        items?: any[];
        next?: string | null;
      };
      for (const row of json.items ?? []) {
        const t = row?.track;
        if (!t?.id) continue; // episodios/locales sin id
        items.push({
          sourceId: t.id,
          title: t.name ?? '(sin título)',
          artist:
            (t.artists ?? []).map((a: any) => a.name).filter(Boolean).join(', ') ||
            null,
          durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
          year: parseYear(t.album?.release_date),
          imageUrl: t.album?.images?.[0]?.url ?? null,
          url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
          match: null,
        });
      }
      url = json.next ?? null;
    }

    // Enriquecer con nuestro catálogo/biblioteca (match por sourceId de Spotify).
    const bySpotifyId = await this.tracks.findBySpotifyIds(
      items.map((v) => v.sourceId),
      userId,
    );
    for (const v of items) {
      const t = bySpotifyId.get(v.sourceId);
      v.match = t
        ? {
            trackId: t.id,
            style: t.style,
            substyles: t.substyles,
            durationSec: t.durationSec,
            year: t.year,
            inCatalog: t.scope === 'CATALOG',
            inLibrary: t.inLibrary ?? false,
          }
        : null;
    }

    return { ...meta, items };
  }

  /** Resumen de una playlist (para las tarjetas): match al catálogo + duración. */
  async getPlaylistStats(
    userId: string,
    playlistId: string,
  ): Promise<SpotifyPlaylistStats> {
    const d = await this.getPlaylistDetail(userId, playlistId);
    return {
      itemCount: d.items.length,
      inLibrary: d.items.filter((v) => v.match?.inLibrary).length,
      inCatalog: d.items.filter((v) => v.match?.inCatalog).length,
      external: d.items.filter((v) => !v.match).length,
      bachata: d.items.filter((v) => v.match?.style === 'BACHATA').length,
      salsa: d.items.filter((v) => v.match?.style === 'SALSA').length,
      totalSec: d.items.reduce((a, v) => a + (v.durationSec ?? 0), 0),
    };
  }

  /**
   * "Elimina" una playlist de tu cuenta: en Spotify es dejar de seguirla
   * (DELETE /playlists/{id}/followers). Requiere scope de modificación.
   */
  async deletePlaylist(userId: string, playlistId: string): Promise<void> {
    const token = await this.accessToken(userId);
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/followers`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok && res.status !== 404) {
      throw new BadRequestException(
        `No se pudo eliminar la playlist en Spotify: ${await res.text()}`,
      );
    }
  }
}

/** "2021-05-10" | "2021" -> 2021 (o null). */
function parseYear(releaseDate?: string): number | null {
  if (!releaseDate) return null;
  const y = Number(String(releaseDate).slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}
