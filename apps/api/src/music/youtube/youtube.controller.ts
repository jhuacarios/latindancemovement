import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { YoutubeOAuthService } from './youtube-oauth.service';
import {
  CreateYoutubePlaylistDto,
  YoutubePatternQueryDto,
} from './dto/create-youtube-playlist.dto';

@Controller('music/youtube')
export class YoutubeController {
  constructor(private readonly yt: YoutubeOAuthService) {}

  /** ¿La cuenta de YouTube del usuario está conectada? */
  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  async status(@CurrentUser() user: AuthUser) {
    return { connected: await this.yt.isConnected(user.id) };
  }

  /** URL de consentimiento de Google para conectar la cuenta. */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  async authUrl(@CurrentUser() user: AuthUser) {
    return { url: await this.yt.buildAuthUrl(user.id) };
  }

  /** Callback de Google (público: el navegador llega sin nuestro JWT). */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() reply: FastifyReply,
  ) {
    const web = process.env.WEB_URL ?? 'http://localhost:3001';
    try {
      if (error) throw new BadRequestException(error);
      if (!code || !state) throw new BadRequestException('Faltan parámetros.');
      await this.yt.handleCallback(code, state);
      reply.redirect(`${web}/music/tracks?youtube=connected`);
    } catch {
      reply.redirect(`${web}/music/tracks?youtube=error`);
    }
  }

  /** Cuántas canciones tendría la playlist con el patrón dado, sin crearla. */
  @Get('preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  preview(@Query() q: YoutubePatternQueryDto, @CurrentUser() user: AuthUser) {
    return this.yt.previewPattern(user.id, q);
  }

  /** Crea la playlist rápida (patrón configurable, orden aleatorio) en YouTube. */
  @Post('playlist')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  createPlaylist(
    @Body() dto: CreateYoutubePlaylistDto,
    @CurrentUser() user: AuthUser,
  ) {
    const title = dto.title?.trim() || 'Playlist YouTube rápida — Baile Latino';
    return this.yt.generatePatternPlaylist(user.id, title, dto.privacy ?? 'public', {
      bachataPerBlock: dto.bachataPerBlock,
      salsaPerBlock: dto.salsaPerBlock,
      order: dto.order,
    });
  }

  /** Lista las playlists de la cuenta de YouTube del usuario. */
  @Get('playlists')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  myPlaylists(@CurrentUser() user: AuthUser) {
    return this.yt.listMyPlaylists(user.id);
  }

  /** Resumen de una playlist: contadores + duración total. */
  @Get('playlists/:id/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  playlistStats(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.yt.getPlaylistStats(user.id, id);
  }

  /** Detalle de una playlist propia: metadatos + sus videos. */
  @Get('playlists/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  playlistDetail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.yt.getPlaylistDetail(user.id, id);
  }

  /** Elimina una playlist de la cuenta de YouTube del usuario. */
  @Delete('playlists/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  async deletePlaylist(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.yt.deletePlaylist(user.id, id);
    return { deleted: true };
  }

  /** Crea una playlist en YouTube con las canciones de una playlist interna (snapshot). */
  @Post('from-template/:playlistId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  createFromTemplate(
    @Param('playlistId') playlistId: string,
    @Body() dto: CreateYoutubePlaylistDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.yt.createPlaylistFromTemplate(
      user.id,
      playlistId,
      dto.title,
      dto.privacy,
    );
  }

  /** Desconecta la cuenta de YouTube (borra el refresh token). */
  @Delete('connection')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  async disconnect(@CurrentUser() user: AuthUser) {
    await this.yt.disconnect(user.id);
    return { disconnected: true };
  }
}
