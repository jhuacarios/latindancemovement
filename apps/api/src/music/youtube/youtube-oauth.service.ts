import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { YoutubePlaylistResult } from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';
import { LibraryService } from '../library/library.service';
import { interleavePattern, shuffle } from './playlist-pattern.util';

/** Permite gestionar (crear) playlists en la cuenta del usuario. */
const SCOPE = 'https://www.googleapis.com/auth/youtube';
const BLOCK_B = 5; // bachatas por bloque
const BLOCK_S = 3; // salsas por bloque

const refreshKey = (userId: string) => `yt_refresh:${userId}`;
const stateKey = (state: string) => `yt_state:${state}`;

@Injectable()
export class YoutubeOAuthService {
  private readonly logger = new Logger(YoutubeOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly library: LibraryService,
  ) {}

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

  // --- Crear la playlist con el patrón -------------------------------------
  async generatePatternPlaylist(
    userId: string,
    title: string,
    privacyStatus: 'private' | 'unlisted' | 'public',
  ): Promise<YoutubePlaylistResult> {
    const { bachata, salsa } = await this.library.myYoutubeVideoIdsByStyle(userId);
    const ordered = interleavePattern(
      shuffle(bachata),
      shuffle(salsa),
      BLOCK_B,
      BLOCK_S,
    );
    if (!ordered.length) {
      throw new BadRequestException(
        `No hay suficientes canciones de YouTube en Mis Canciones para el patrón ` +
          `(se necesitan al menos ${BLOCK_B} bachatas y ${BLOCK_S} salsas). ` +
          `Tienes ${bachata.length} bachatas y ${salsa.length} salsas de YouTube.`,
      );
    }
    const blocks = ordered.length / (BLOCK_B + BLOCK_S);
    const bachUsed = blocks * BLOCK_B;
    const salUsed = blocks * BLOCK_S;
    const leftover = bachata.length - bachUsed + (salsa.length - salUsed);

    const description =
      `Generada por Baile Latino — patrón ${BLOCK_B} bachatas / ${BLOCK_S} salsas, ` +
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
      total: ordered.length,
      bachata: bachUsed,
      salsa: salUsed,
      leftover,
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
