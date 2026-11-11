import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { StudioService } from './studio.service';
import { StudioEnabledGuard } from './studio-enabled.guard';
import { CreateUploadDto, ListAudioFilesQueryDto, SetFirstBeatDto } from './dto/studio.dto';

/**
 * Módulo Estudio: el usuario sube su audio y estudia la canción (grilla de
 * frases de 8, energía, secciones). Todo es privado del dueño del archivo.
 */
@Controller('studio')
@UseGuards(StudioEnabledGuard, JwtAuthGuard)
export class StudioController {
  constructor(private readonly studio: StudioService) {}

  /** Pide una subida: devuelve la URL firmada para subir el archivo directo al storage. */
  @Post('uploads')
  createUpload(@CurrentUser() user: AuthUser, @Body() dto: CreateUploadDto) {
    return this.studio.createUpload(user, dto);
  }

  /** Confirma que el archivo terminó de subir y encola el análisis. */
  @Post('audio-files/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studio.completeUpload(user, id);
  }

  @Get('audio-files')
  list(@CurrentUser() user: AuthUser, @Query() query: ListAudioFilesQueryDto) {
    return this.studio.list(user, query.style);
  }

  @Get('audio-files/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studio.findOne(user, id);
  }

  /** URL firmada de corta duración para reproducir. */
  @Get('audio-files/:id/url')
  playbackUrl(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studio.playbackUrl(user, id);
  }

  @Post('audio-files/:id/reanalyze')
  @HttpCode(200)
  reanalyze(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studio.reanalyze(user, id);
  }

  /** Pide separar el audio en pistas para el mezclador (tarda un par de minutos). */
  @Post('audio-files/:id/stems')
  @HttpCode(200)
  requestStems(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studio.requestStems(user, id);
  }

  /** URLs firmadas de las pistas del mezclador. */
  @Get('audio-files/:id/stems')
  stemUrls(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studio.stemUrls(user, id);
  }

  /** Corrige el "1" (o lo vuelve al automático con `timeMs: null`). */
  @Patch('audio-files/:id/first-beat')
  setFirstBeat(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetFirstBeatDto,
  ) {
    return this.studio.setFirstBeat(user, id, dto);
  }

  /** Borra el audio, su análisis y sus notas. */
  @Delete('audio-files/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.studio.remove(user, id);
  }
}
