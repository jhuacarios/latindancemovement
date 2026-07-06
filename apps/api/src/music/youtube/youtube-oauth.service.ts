import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import type {
  YoutubeOwnPlaylist,
  YoutubePlaylistDetail,
  YoutubePlaylistFromTemplateResult,
  YoutubePlaylistPattern,
  YoutubePlaylistPreview,
  YoutubePlaylistResult,
  YoutubePlaylistStats,
  YoutubePlaylistVideo,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';
import { LibraryService } from '../library/library.service';
import { TracksService } from '../tracks/tracks.service';
import { PlaylistsService } from '../playlists/playlists.service';
import { interleavePattern, shuffle } from './playlist-pattern.util';

/** Permite gestionar (crear) playlists en la cuenta del usuario. */
const SCOPE = 'https://www.googleapis.com/auth/youtube';

/** Patrón por defecto si el cliente no envía nada: 5 bachatas / 3 salsas. */
const DEFAULT_PATTERN: YoutubePlaylistPattern = {
  bachataPerBlock: 5,
  salsaPerBlock: 3,
  order: 'bachata',
};

const refreshKey = (userId: string) => `yt_refresh:${userId}`;
const stateKey = (state: string) => `yt_state:${state}`;

@Injectable()
export class YoutubeOAuthService {
  private readonly logger = new Logger(YoutubeOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly library: LibraryService,
    private readonly tracks: TracksService,
    private readonly playlists: PlaylistsService,
  ) {}

  /**
   * Crea una playlist en YouTube con las canciones (de YouTube) de una playlist
   * interna, como SNAPSHOT. No vincula nada: la interna es una plantilla y puede
   * cambiar después sin afectar la de YouTube.
   */
  async createPlaylistFromTemplate(
    userId: string,
    playlistId: string,
    title?: string,
    privacyStatus: 'private' | 'unlisted' | 'public' = 'public',
  ): Promise<YoutubePlaylistFromTemplateResult> {
    const pl = await this.playlists.findOne(playlistId);
    if (pl.ownerId !== userId) {
      throw new ForbiddenException('Esta playlist no es tuya.');
    }
    const items = pl.items ?? [];
    const videoIds = items
      .filter((i) => i.track?.source === 'YOUTUBE' && i.track.sourceId)
      .map((i) => i.track!.sourceId);
    const skipped = items.length - videoIds.length;
    if (!videoIds.length) {
      throw new BadRequestException(
        'La playlist no tiene canciones de YouTube para exportar.',
      );
    }

    const finalTitle = title?.trim() || `${pl.name} — Baile Latino`;
    const description =
      `Generada desde la plantilla "${pl.name}" en Baile Latino. ` +
      `Snapshot: no se sincroniza con la plantilla.`;
    const newId = await this.createPlaylistWithVideos(
      userId,
      finalTitle,
      description,
      privacyStatus,
      videoIds,
    );
    return {
      playlistId: newId,
      url: `https://www.youtube.com/playlist?list=${newId}`,
      added: videoIds.length,
      skipped,
    };
  }

  get configured(): boolean {
    return Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
  }

  private get clientId(): string {
    return process.env.GOOGLE_OAUTH_CLIENT_ID as string;
  }
  private get clientSecret(): string {
    return process.env.GOOGLE_OAUTH_CLIENT_SECRET as string;
  }
  private redirectUri(): string {
    return (
      process.env.GOOGLE_OAUTH_REDIRECT_URI ??
      'http://localhost:3000/api/v1/music/youtube/callback'
    );
  }

  // --- OAuth ----------------------------------------------------------------
  async buildAuthUrl(userId: string): Promise<string> {
    if (!this.configured) {
      throw new BadRequestException(
        'Falta configurar GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.',
      );
    }
    const state = randomBytes(16).toString('hex');
    await this.prisma.setting.upsert({
      where: { key: stateKey(state) },
      create: { key: stateKey(state), value: userId },
      update: { value: userId },
    });
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Intercambia el code por tokens y guarda el refresh token del usuario. */
  async handleCallback(code: string, state: string): Promise<void> {
    const row = await this.prisma.setting.findUnique({
      where: { key: stateKey(state) },
    });
    if (!row) throw new BadRequestException('State inválido o expirado.');
    const userId = row.value;
    await this.prisma.setting
      .delete({ where: { key: stateKey(state) } })
      .catch(() => undefined);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!res.ok) {
      throw new BadRequestException(
        `Google rechazó el intercambio: ${await res.text()}`,
      );
    }
    const json = (await res.json()) as { refresh_token?: string };
    if (!json.refresh_token) {
      throw new BadRequestException(
        'Google no devolvió refresh_token. Revoca el acceso de la app en tu cuenta y reintenta.',
      );
    }
    await this.prisma.setting.upsert({
      where: { key: refreshKey(userId) },
      create: { key: refreshKey(userId), value: json.refresh_token },
      update: { value: json.refresh_token },
    });
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

  /** Trae las playlists de la cuenta de YouTube del usuario (todas, paginando). */
  async listMyPlaylists(userId: string): Promise<YoutubeOwnPlaylist[]> {
    const token = await this.accessToken(userId);
    const out: YoutubeOwnPlaylist[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,status',
        mine: 'true',
        maxResults: '50',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlists?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        await this.youtubeFail(res, 'No se pudieron traer tus playlists de YouTube.');
      }
      const json = (await res.json()) as {
        items?: Array<{
          id: string;
          snippet?: {
            title?: string;
            description?: string;
            publishedAt?: string;
            thumbnails?: Record<string, { url?: string }>;
          };
          contentDetails?: { itemCount?: number };
          status?: { privacyStatus?: string };
        }>;
        nextPageToken?: string;
      };
      for (const it of json.items ?? []) out.push(this.mapPlaylist(it));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }

  /** Mapea la respuesta cruda de playlists.list a nuestro tipo. */
  private mapPlaylist(it: {
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { itemCount?: number };
    status?: { privacyStatus?: string };
  }): YoutubeOwnPlaylist {
    const th = it.snippet?.thumbnails;
    return {
      id: it.id,
      title: it.snippet?.title ?? '(sin título)',
      description: it.snippet?.description ?? '',
      itemCount: it.contentDetails?.itemCount ?? 0,
      privacyStatus: it.status?.privacyStatus ?? 'private',
      thumbnailUrl: th?.medium?.url ?? th?.high?.url ?? th?.default?.url ?? null,
      publishedAt: it.snippet?.publishedAt ?? null,
      url: `https://www.youtube.com/playlist?list=${it.id}`,
    };
  }

  /** Detalle de una playlist propia: metadatos + sus videos (paginados). */
  async getPlaylistDetail(
    userId: string,
    playlistId: string,
  ): Promise<YoutubePlaylistDetail> {
    const token = await this.accessToken(userId);

    // Metadatos de la playlist.
    const metaRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails,status&id=${encodeURIComponent(playlistId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!metaRes.ok) {
      throw new BadRequestException(
        `No se pudo traer la playlist: ${await metaRes.text()}`,
      );
    }
    const metaJson = (await metaRes.json()) as {
      items?: Array<Parameters<YoutubeOAuthService['mapPlaylist']>[0]>;
    };
    const raw = metaJson.items?.[0];
    if (!raw) throw new BadRequestException('La playlist no existe.');
    const meta = this.mapPlaylist(raw);

    // Videos de la playlist (paginando).
    const items: YoutubePlaylistVideo[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: '50',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        await this.youtubeFail(res, 'No se pudieron traer los videos de la playlist.');
      }
      const json = (await res.json()) as {
        items?: Array<{
          snippet?: {
            title?: string;
            position?: number;
            videoOwnerChannelTitle?: string;
            channelTitle?: string;
            thumbnails?: Record<string, { url?: string }>;
            resourceId?: { videoId?: string };
          };
          contentDetails?: { videoId?: string };
        }>;
        nextPageToken?: string;
      };
      for (const it of json.items ?? []) {
        const videoId =
          it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId ?? '';
        if (!videoId) continue;
        const th = it.snippet?.thumbnails;
        items.push({
          videoId,
          title: it.snippet?.title ?? '(sin título)',
          channelTitle:
            it.snippet?.videoOwnerChannelTitle ?? it.snippet?.channelTitle ?? '',
          thumbnailUrl:
            th?.medium?.url ?? th?.default?.url ?? th?.high?.url ?? null,
          position: it.snippet?.position ?? items.length,
          durationSec: null,
          url: `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`,
        });
      }
      pageToken = json.nextPageToken;
    } while (pageToken);

    // Duración real de cada video (videos.list, en lotes de 50).
    const durations = await this.fetchDurations(
      token,
      items.map((v) => v.videoId),
    );
    for (const v of items) v.durationSec = durations.get(v.videoId) ?? null;

    // Enriquecer con nuestro catálogo: match por videoId.
    const byVideoId = await this.tracks.findByYoutubeIds(
      items.map((v) => v.videoId),
      userId,
    );
    for (const v of items) {
      const t = byVideoId.get(v.videoId);
      v.match = t
        ? {
            trackId: t.id,
            style: t.style,
            substyles: t.substyles,
            durationSec: t.durationSec,
            year: t.year,
            approvalStatus: t.approvalStatus,
            inCatalog: t.scope === 'CATALOG',
            inLibrary: t.inLibrary ?? false,
            embeddable: t.details?.embeddable ?? null,
          }
        : null;
    }

    return { ...meta, items };
  }

  /** Elimina una playlist de la cuenta de YouTube del usuario. */
  async deletePlaylist(userId: string, playlistId: string): Promise<void> {
    const token = await this.accessToken(userId);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?id=${encodeURIComponent(playlistId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    // 204 = borrada; 404 = ya no existe (lo tratamos como éxito idempotente).
    if (!res.ok && res.status !== 404) {
      await this.youtubeFail(res, 'No se pudo eliminar la playlist en YouTube.');
    }
  }

  /** Resumen de una playlist: cuántas en cada lugar + duración total. */
  async getPlaylistStats(
    userId: string,
    playlistId: string,
  ): Promise<YoutubePlaylistStats> {
    const d = await this.getPlaylistDetail(userId, playlistId);
    return {
      itemCount: d.items.length,
      inLibrary: d.items.filter((v) => v.match?.inLibrary).length,
      inCatalog: d.items.filter((v) => v.match?.inCatalog).length,
      external: d.items.filter((v) => !v.match).length,
      totalSec: d.items.reduce((a, v) => a + (v.durationSec ?? 0), 0),
      partialDuration: d.items.some((v) => v.durationSec == null),
    };
  }

  /** Trae la duración real (segundos) de cada videoId vía videos.list. */
  private async fetchDurations(
    token: string,
    videoIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const ids = [...new Set(videoIds.filter(Boolean))];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const params = new URLSearchParams({
        part: 'contentDetails',
        id: chunk.join(','),
        maxResults: '50',
      });
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue; // no abortar el detalle por las duraciones
      const json = (await res.json()) as {
        items?: Array<{ id?: string; contentDetails?: { duration?: string } }>;
      };
      for (const it of json.items ?? []) {
        const d = it.contentDetails?.duration;
        if (it.id && d) map.set(it.id, this.parseIsoDuration(d));
      }
    }
    return map;
  }

  /** Convierte una duración ISO 8601 (ej: "PT3M45S") a segundos. */
  private parseIsoDuration(iso: string): number {
    const m = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
    if (!m) return 0;
    const h = Number(m[1] ?? 0);
    const min = Number(m[2] ?? 0);
    const s = Number(m[3] ?? 0);
    return h * 3600 + min * 60 + s;
  }

  /**
   * Traduce una respuesta fallida de la API de YouTube a un error legible:
   * cuota agotada → 503 con mensaje claro (la UI lo detecta por "cuota"); otro
   * motivo → BadRequest con `fallback` (sin volcar el JSON crudo de Google).
   */
  private async youtubeFail(res: Response, fallback: string): Promise<never> {
    let reason = '';
    try {
      const body = (await res.clone().json()) as {
        error?: { errors?: Array<{ reason?: string }> };
      };
      reason = body.error?.errors?.[0]?.reason ?? '';
    } catch {
      /* cuerpo no-JSON: se usa el fallback */
    }
    if (
      res.status === 403 &&
      ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(
        reason,
      )
    ) {
      throw new ServiceUnavailableException(
        'Cuota diaria de YouTube agotada. Reintenta después de medianoche hora ' +
          'del Pacífico (~01:00–02:00 en Chile) o usa otra API key.',
      );
    }
    throw new BadRequestException(fallback);
  }

  private async accessToken(userId: string): Promise<string> {
    const row = await this.prisma.setting.findUnique({
      where: { key: refreshKey(userId) },
    });
    if (!row?.value) {
      throw new BadRequestException('Conecta tu cuenta de YouTube primero.');
    }
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: row.value,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) {
      await this.disconnect(userId); // token revocado/expirado
      throw new BadRequestException(
        'La conexión con YouTube expiró. Vuelve a conectar tu cuenta.',
      );
    }
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  /** Normaliza el patrón recibido aplicando defaults y límites sanos. */
  private resolvePattern(p?: Partial<YoutubePlaylistPattern>): YoutubePlaylistPattern {
    const clamp = (n: number | undefined, fallback: number) =>
      Math.min(50, Math.max(1, Math.round(n ?? fallback)));
    return {
      bachataPerBlock: clamp(p?.bachataPerBlock, DEFAULT_PATTERN.bachataPerBlock),
      salsaPerBlock: clamp(p?.salsaPerBlock, DEFAULT_PATTERN.salsaPerBlock),
      order: p?.order === 'salsa' ? 'salsa' : 'bachata',
    };
  }

  // --- Cálculo del patrón (compartido por preview y creación) --------------
  private async computeOrdered(
    userId: string,
    pattern: YoutubePlaylistPattern,
  ): Promise<{ ordered: string[]; bachataAvail: number; salsaAvail: number }> {
    const { bachata, salsa } = await this.library.myYoutubeVideoIdsByStyle(userId);
    const b = shuffle(bachata);
    const s = shuffle(salsa);
    // El estilo del "order" abre cada bloque; el otro lo cierra.
    const ordered =
      pattern.order === 'salsa'
        ? interleavePattern(s, b, pattern.salsaPerBlock, pattern.bachataPerBlock)
        : interleavePattern(b, s, pattern.bachataPerBlock, pattern.salsaPerBlock);
    return { ordered, bachataAvail: bachata.length, salsaAvail: salsa.length };
  }

  private counts(
    ordered: string[],
    bachataAvail: number,
    salsaAvail: number,
    pattern: YoutubePlaylistPattern,
  ) {
    const blocks = ordered.length / (pattern.bachataPerBlock + pattern.salsaPerBlock);
    const bachata = blocks * pattern.bachataPerBlock;
    const salsa = blocks * pattern.salsaPerBlock;
    return {
      total: ordered.length,
      bachata,
      salsa,
      leftover: bachataAvail - bachata + (salsaAvail - salsa),
    };
  }

  /** Cuántas canciones tendría la playlist, sin crearla. */
  async previewPattern(
    userId: string,
    pattern?: Partial<YoutubePlaylistPattern>,
  ): Promise<YoutubePlaylistPreview> {
    const cfg = this.resolvePattern(pattern);
    const { ordered, bachataAvail, salsaAvail } = await this.computeOrdered(userId, cfg);
    return this.counts(ordered, bachataAvail, salsaAvail, cfg);
  }

  // --- Crear la playlist con el patrón -------------------------------------
  async generatePatternPlaylist(
    userId: string,
    title: string,
    privacyStatus: 'private' | 'unlisted' | 'public',
    pattern?: Partial<YoutubePlaylistPattern>,
  ): Promise<YoutubePlaylistResult> {
    const cfg = this.resolvePattern(pattern);
    const { ordered, bachataAvail, salsaAvail } = await this.computeOrdered(userId, cfg);
    if (!ordered.length) {
      throw new BadRequestException(
        `No hay suficientes canciones de YouTube en Mis Canciones para el patrón ` +
          `(se necesitan al menos ${cfg.bachataPerBlock} bachatas y ${cfg.salsaPerBlock} salsas). ` +
          `Tienes ${bachataAvail} bachatas y ${salsaAvail} salsas de YouTube.`,
      );
    }
    const c = this.counts(ordered, bachataAvail, salsaAvail, cfg);

    const first = cfg.order === 'salsa' ? 'salsas' : 'bachatas';
    const description =
      `Generada por Baile Latino — patrón ${cfg.bachataPerBlock} bachatas / ` +
      `${cfg.salsaPerBlock} salsas (empieza por ${first}), ` +
      `orden aleatorio dentro de cada estilo.`;
    const playlistId = await this.createPlaylistWithVideos(
      userId,
      title,
      description,
      privacyStatus,
      ordered,
    );
    return {
      playlistId,
      url: `https://www.youtube.com/playlist?list=${playlistId}`,
      ...c,
    };
  }

  /** Crea la playlist y agrega los videos EN ORDEN (secuencial). */
  private async createPlaylistWithVideos(
    userId: string,
    title: string,
    description: string,
    privacyStatus: 'private' | 'unlisted' | 'public',
    videoIds: string[],
  ): Promise<string> {
    const token = await this.accessToken(userId);

    const plRes = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: { title, description },
          status: { privacyStatus },
        }),
      },
    );
    if (!plRes.ok) {
      throw new BadRequestException(
        `No se pudo crear la playlist en YouTube: ${await plRes.text()}`,
      );
    }
    const pl = (await plRes.json()) as { id: string };

    for (const videoId of videoIds) {
      const itRes = await fetch(
        'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snippet: {
              playlistId: pl.id,
              resourceId: { kind: 'youtube#video', videoId },
            },
          }),
        },
      );
      if (!itRes.ok) {
        // No abortar por un video privado/eliminado; se omite y se sigue.
        this.logger.warn(
          `No se pudo agregar el video ${videoId}: ${await itRes.text()}`,
        );
      }
    }
    return pl.id;
  }
}
