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
import { SpotifyOAuthService } from './spotify-oauth.service';

@Controller('music/spotify')
export class SpotifyController {
  constructor(private readonly sp: SpotifyOAuthService) {}

  /** ¿La cuenta de Spotify del usuario está conectada? */
  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  async status(@CurrentUser() user: AuthUser) {
    return { connected: await this.sp.isConnected(user.id) };
  }

  /** Cuenta de Spotify conectada (id, nombre, email, plan). */
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  me(@CurrentUser() user: AuthUser) {
    return this.sp.getMe(user.id);
  }

  /** URL de consentimiento de Spotify para conectar la cuenta. */
  @Get('auth-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  async authUrl(@CurrentUser() user: AuthUser) {
    return { url: await this.sp.buildAuthUrl(user.id) };
  }

  /** Callback de Spotify (público: el navegador llega sin nuestro JWT). */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() reply: FastifyReply,
  ) {
    const web = (process.env.WEB_URL ?? 'http://localhost:3001')
      .split(',')[0]
      .trim();
    try {
      if (error) throw new BadRequestException(error);
      if (!code || !state) throw new BadRequestException('Faltan parámetros.');
      await this.sp.handleCallback(code, state);
      reply
        .header('location', `${web}/music/spotify/playlists?spotify=connected`)
        .code(302)
        .send();
    } catch {
      reply
        .header('location', `${web}/music/spotify/playlists?spotify=error`)
        .code(302)
        .send();
    }
  }

  /** Playlists de la cuenta de Spotify del usuario. */
  @Get('playlists')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  listPlaylists(@CurrentUser() user: AuthUser) {
    return this.sp.listMyPlaylists(user.id);
  }

  /** Resumen de una playlist (para las tarjetas de la lista). */
  @Get('playlists/:id/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  playlistStats(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sp.getPlaylistStats(user.id, id);
  }

  /** Detalle de una playlist de Spotify (con match al catálogo/biblioteca). */
  @Get('playlists/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  playlistDetail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sp.getPlaylistDetail(user.id, id);
  }

  /** "Elimina" (deja de seguir) una playlist de tu cuenta de Spotify. */
  @Delete('playlists/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  async deletePlaylist(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.sp.deletePlaylist(user.id, id);
    return { deleted: true };
  }

  /** Crea una playlist en Spotify con las canciones de una playlist interna. */
  @Post('from-internal/:playlistId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  createFromInternal(
    @Param('playlistId') playlistId: string,
    @Body() body: { title?: string; public?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.sp.createFromInternal(
      user.id,
      playlistId,
      body.title,
      body.public ?? false,
    );
  }

  /** Desconecta la cuenta de Spotify. */
  @Delete('connection')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  async disconnect(@CurrentUser() user: AuthUser) {
    await this.sp.disconnect(user.id);
    return { disconnected: true };
  }
}
