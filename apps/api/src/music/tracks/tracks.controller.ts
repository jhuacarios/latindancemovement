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
import type { DanceStyle } from '@baile-latino/types';
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
import { SpotifyImportDto, SpotifyPreviewDto } from './dto/spotify-import.dto';
import { MergeTracksDto } from './dto/merge-tracks.dto';
import { SpotifyCatalogImportDto } from './dto/spotify-catalog-import.dto';
import { SpotifyMatchService } from './spotify-match.service';
import { SpotifyService } from './spotify.service';

@Controller('music/tracks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TracksController {
  constructor(
    private readonly tracks: TracksService,
    private readonly exporter: TracksExportService,
    private readonly excelImporter: TracksImportExcelService,
    private readonly youtube: YoutubeMetadataService,
    private readonly spotifyMatch: SpotifyMatchService,
    private readonly spotify: SpotifyService,
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

  /** Extrae metadata de un link de Spotify para autocompletar (no guarda). */
  @Get('spotify-metadata')
  @Roles('DJ', 'ORGANIZADOR', 'ARTISTA')
  spotifyMetadata(@Query('link') link: string) {
    if (!link) throw new BadRequestException('Falta el parámetro "link".');
    return this.spotify.getTrackByLink(link);
  }

  /** Conteo del catálogo por estilo, para los contadores de la vista. */
  @Get('summary')
  summary(@Query('source') source?: 'YOUTUBE' | 'SPOTIFY') {
    return this.tracks.summary(source);
  }

  /** Directorio de artistas del catálogo, ordenados por nombre. */
  @Get('artists')
  artists() {
    return this.tracks.listArtists();
  }

  /** Feed "Nuevo y sonando": lanzamientos recientes por estilo, rankeados. */
  @Get('discover')
  discover(@Query('months') months?: string) {
    const n = Math.min(24, Math.max(1, Number(months) || 5));
    return this.tracks.discover(n);
  }

  /**
   * Candidatos: lanzamientos recientes en Spotify de artistas que ya están en el
   * catálogo, que aún NO están en el catálogo (para curar). Pesado; cacheado.
   */
  @Get('discover-candidates')
  @Roles('SUPER_ADMIN')
  discoverCandidates(
    @Query('months') months?: string,
    @Query('artists') artists?: string,
  ) {
    const m = Math.min(24, Math.max(1, Number(months) || 6));
    const a = Math.min(80, Math.max(5, Number(artists) || 30));
    return this.tracks.discoverCandidates(m, a);
  }

  /**
   * Candidatos por YouTube: subidas recientes de los canales de tus artistas del
   * catálogo, que aún NO están en el catálogo, con estilo propuesto (a confirmar).
   */
  @Get('discover-youtube')
  @Roles('SUPER_ADMIN')
  discoverYoutube(
    @Query('months') months?: string,
    @Query('channels') channels?: string,
  ) {
    const m = Math.min(24, Math.max(1, Number(months) || 3));
    const c = Math.min(80, Math.max(5, Number(channels) || 40));
    return this.tracks.discoverYoutube(m, c);
  }

  /** sourceIds de YouTube ya en el catálogo (para ignorar al cargar playlists). */
  @Get('catalog-youtube-ids')
  @Roles('SUPER_ADMIN')
  catalogYoutubeIds() {
    return this.tracks.catalogYoutubeSourceIds();
  }

  /** Grupos de posibles canciones duplicadas en el catálogo. */
  @Get('duplicates')
  @Roles('SUPER_ADMIN')
  duplicates() {
    return this.tracks.findDuplicateGroups();
  }

  /** Conserva una y elimina las duplicadas (reasignando sus referencias). */
  @Post('merge')
  @Roles('SUPER_ADMIN')
  merge(@Body() dto: MergeTracksDto) {
    return this.tracks.mergeDuplicates(dto.keepId, dto.removeIds);
  }

  /** Completa la duración faltante de las canciones del catálogo desde YouTube. */
  @Post('backfill-durations')
  @Roles('SUPER_ADMIN')
  async backfillDurations() {
    const missing = await this.tracks.catalogMissingDuration();
    if (!missing.length) return { missing: 0, updated: 0 };
    const metas = await this.youtube.fetchByIds(missing.map((m) => m.sourceId));
    const bySource = new Map(metas.map((m) => [m.sourceId, m.durationSec]));
    const updates = missing
      .map((m) => ({ id: m.id, durationSec: bySource.get(m.sourceId) ?? null }))
      .filter(
        (u): u is { id: string; durationSec: number } => u.durationSec != null,
      );
    const updated = await this.tracks.setDurations(updates);
    return { missing: missing.length, updated };
  }

  /** Rellena las reproducciones (viewCount) faltantes desde la metadata guardada. */
  @Post('backfill-views')
  @Roles('SUPER_ADMIN')
  backfillViews() {
    return this.tracks.backfillViewCounts();
  }

  /** Rellena la fecha de lanzamiento faltante (Spotify, o subida de YouTube). */
  @Post('backfill-release-dates')
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  backfillReleaseDates(@Query('limit') limit?: string) {
    const n = Math.min(200, Math.max(1, Number(limit) || 40));
    return this.tracks.backfillReleaseDates(n);
  }

  /** Rellena la reproducibilidad (embed) de las canciones de Spotify. */
  @Post('spotify/backfill-playable')
  @Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
  backfillSpotifyPlayable(@Query('limit') limit?: string) {
    const n = Math.min(100, Math.max(1, Number(limit) || 40));
    return this.tracks.backfillSpotifyPlayable(n);
  }

  /** Aplica fechas de lanzamiento por id (editar mes+año o resetear con null). */
  @Patch('release-dates')
  @Roles('SUPER_ADMIN')
  applyReleaseDates(@Body() body: { dates?: Record<string, string | null> }) {
    return this.tracks.applyReleaseDates(body?.dates ?? {});
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
  async playlistPreview(@Body() dto: PlaylistPreviewDto) {
    const items = await this.youtube.extractPlaylist(dto.link);
    // Cruce con el catálogo por artista+título para las que no detectó estilo.
    await this.tracks.fillStylesFromCatalog(items);
    return items;
  }

  /** Importa al catálogo todas las canciones de una playlist de YouTube. */
  @Post('import-playlist')
  @Roles('SUPER_ADMIN')
  async importPlaylist(
    @Body() dto: ImportPlaylistDto,
    @CurrentUser() user: AuthUser,
  ) {
    const items = await this.youtube.extractPlaylist(dto.link);
    await this.tracks.fillStylesFromCatalog(items);
    // Año editado por el usuario en el preview: pisa al detectado.
    if (dto.yearOverrides) {
      for (const it of items) {
        const y = dto.yearOverrides[it.sourceId];
        if (typeof y === 'number' && y > 1900 && y < 3000) it.year = y;
      }
    }
    // Sin estilo por defecto: el estilo sale de lo detectado o de la elección
    // del usuario (overrides). Las que queden sin estilo se omiten.
    return this.tracks.importPlaylistItems(
      items,
      undefined,
      user.id,
      dto.overrides,
      dto.dateOverrides,
    );
  }

  /** Matchea una playlist de Spotify con los mejores videos de YouTube (no guarda). */
  @Post('spotify-preview')
  @Roles('SUPER_ADMIN')
  spotifyPreview(@Body() dto: SpotifyPreviewDto) {
    return this.spotifyMatch.matchPlaylist(dto.link);
  }

  /** Importa al catálogo los videos de YouTube elegidos para cada track. */
  @Post('spotify-import')
  @Roles('SUPER_ADMIN')
  async spotifyImport(
    @Body() dto: SpotifyImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    const items = await this.youtube.fetchByIds(
      dto.selections.map((s) => s.sourceId),
    );
    const overrides = Object.fromEntries(
      dto.selections.map((s) => [s.sourceId, s.style]),
    );
    return this.tracks.importPlaylistItems(items, undefined, user.id, overrides);
  }

  /** sourceIds de Spotify ya en el catálogo (para ignorar al importar). */
  @Get('catalog-spotify-ids')
  @Roles('SUPER_ADMIN')
  catalogSpotifyIds() {
    return this.tracks.catalogSpotifySourceIds();
  }

  /** Resuelve una playlist de Spotify a tracks reales de Spotify (no guarda). */
  @Post('spotify-catalog-preview')
  @Roles('SUPER_ADMIN')
  async spotifyCatalogPreview(@Body() dto: PlaylistPreviewDto) {
    const items = await this.spotify.getPlaylistResolved(dto.link);
    // 1) Hereda el estilo del catálogo por artista+título (curación fiable).
    await this.tracks.fillStylesFromCatalog(items);
    // 2) Fallback: si el nombre de la playlist dice bachata/salsa, aplícalo a
    //    las que aún no tienen estilo (playlists suelen ser mono-estilo).
    const text = (await this.spotify.getPlaylistName(dto.link))?.toLowerCase() ?? '';
    const nameStyle: DanceStyle | null = /bachata/.test(text)
      ? 'BACHATA'
      : /salsa/.test(text)
        ? 'SALSA'
        : null;
    if (nameStyle) {
      for (const it of items) if (!it.detectedStyle) it.detectedStyle = nameStyle;
    }
    return items;
  }

  /** Importa al catálogo (como tracks Spotify) las canciones elegidas. */
  @Post('spotify-catalog-import')
  @Roles('SUPER_ADMIN')
  spotifyCatalogImport(
    @Body() dto: SpotifyCatalogImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tracks.importSpotifyToCatalog(
      dto.items,
      dto.overrides,
      user.id,
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
