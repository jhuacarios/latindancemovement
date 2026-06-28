import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { TracksService } from './tracks.service';
import { TracksExportService } from './tracks-export.service';
import { TracksImportExcelService } from './tracks-import-excel.service';
import { YoutubeMetadataService } from './youtube-metadata.service';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackDto } from './dto/update-track.dto';
import { QueryTracksDto } from './dto/query-tracks.dto';
import { ImportTracksDto } from './dto/import-tracks.dto';
import { ImportPlaylistDto, PlaylistPreviewDto } from './dto/playlist.dto';

@Controller('music/tracks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TracksController {
  constructor(
    private readonly tracks: TracksService,
    private readonly exporter: TracksExportService,
    private readonly excelImporter: TracksImportExcelService,
    private readonly youtube: YoutubeMetadataService,
  ) {}

  /** Lista el catálogo global (anota inLibrary para el usuario actual). */
  @Get()
  findAll(@Query() q: QueryTracksDto, @CurrentUser() user: AuthUser) {
    return this.tracks.findAll(q, user.id);
  }

  /** Descarga el catálogo (filtrable) como Excel. */
  @Get('export.xlsx')
  async export(@Query() q: QueryTracksDto, @Res() reply: FastifyReply) {
    const buffer = await this.exporter.toExcelBuffer(q);
    reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', 'attachment; filename="canciones.xlsx"')
      .send(buffer);
  }

  /** Extrae metadata de un link de YouTube para autocompletar (no guarda). */
  @Get('metadata')
  @Roles('DJ', 'ORGANIZADOR', 'ARTISTA')
  metadata(@Query('link') link: string) {
    if (!link) throw new BadRequestException('Falta el parámetro "link".');
    return this.youtube.extract(link);
  }

  /** sourceIds de YouTube ya en el catálogo (para ignorar al cargar playlists). */
  @Get('catalog-youtube-ids')
  @Roles('SUPER_ADMIN')
  catalogYoutubeIds() {
    return this.tracks.catalogYoutubeSourceIds();
  }

  /** Descarga una plantilla .xlsx para importar canciones. */
  @Get('template.xlsx')
  async template(@Res() reply: FastifyReply) {
    const buffer = await this.exporter.toTemplateBuffer();
    reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', 'attachment; filename="plantilla-canciones.xlsx"')
      .send(buffer);
  }

  /** Carga masiva al catálogo subiendo un archivo Excel (.xlsx). Solo admin. */
  @Post('import-excel')
  @Roles('SUPER_ADMIN')
  async importExcel(@Req() req: FastifyRequest, @CurrentUser() user: AuthUser) {
    const file = await req.file();
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    const buffer = await file.toBuffer();
    return this.excelImporter.importBuffer(buffer, user.id);
  }

  /** Previsualiza las canciones de una playlist de YouTube (no guarda). */
  @Post('playlist-preview')
  @Roles('SUPER_ADMIN')
  playlistPreview(@Body() dto: PlaylistPreviewDto) {
    return this.youtube.extractPlaylist(dto.link);
  }

  /** Importa al catálogo todas las canciones de una playlist de YouTube. */
  @Post('import-playlist')
  @Roles('SUPER_ADMIN')
  async importPlaylist(
    @Body() dto: ImportPlaylistDto,
    @CurrentUser() user: AuthUser,
  ) {
    const items = await this.youtube.extractPlaylist(dto.link);
    // Sin estilo por defecto: el estilo sale de lo detectado o de la elección
    // del usuario (overrides). Las que queden sin estilo se omiten.
    return this.tracks.importPlaylistItems(
      items,
      undefined,
      user.id,
      dto.overrides,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tracks.findOne(id, user.id);
  }

  /** Crear canción en el catálogo global. Solo admin. */
  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateTrackDto, @CurrentUser() user: AuthUser) {
    return this.tracks.create(dto, user.id);
  }

  /** Carga masiva al catálogo por JSON. Solo admin. */
  @Post('import')
  @Roles('SUPER_ADMIN')
  import(@Body() dto: ImportTracksDto, @CurrentUser() user: AuthUser) {
    return this.tracks.importMany(dto.tracks, user.id);
  }

  /** Editar canción del catálogo (sujeto al permiso 'editar' del perfil). */
  @Patch(':id')
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateTrackDto) {
    return this.tracks.update(id, dto);
  }

  /** Eliminar canción del catálogo (sujeto al permiso 'eliminar' del perfil). */
  @Delete(':id')
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  remove(@Param('id') id: string) {
    return this.tracks.remove(id);
  }

  /**
   * Marca una canción como no-reproducible fuera de YouTube. Lo dispara el
   * reproductor cuando YouTube bloquea el embed (error 101/150). Cualquier
   * usuario autenticado puede marcarla (es una corrección factual).
   */
  @Post(':id/not-embeddable')
  markNotEmbeddable(@Param('id') id: string) {
    return this.tracks.markNotEmbeddable(id);
  }
}
