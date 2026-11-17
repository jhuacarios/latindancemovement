import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { readMultipart, validateJsonField } from '../common/multipart';
import { AcademiesService } from './academies.service';
import { AcademyVideosService } from './academy-videos.service';
import { AcademyShareService } from './academy-share.service';
import {
  AddMemberDto,
  CheckDuplicatesDto,
  CompleteVideoUploadDto,
  CreateAcademyDto,
  CreateClassDto,
  CreateVideoUploadDto,
  ListVideosQueryDto,
  MoveMediaDto,
  QueryAcademiesDto,
  ReportVideoDto,
  UpdateAcademyDto,
  UpdateClassDto,
  UpdateVideoDto,
} from './dto/academy.dto';

/**
 * Academias: perfil, horario de clases y videos de las clases. Todo se ve con
 * cualquier cuenta; editan el dueño, sus profesores y el SUPER_ADMIN.
 */
@Controller('academies')
export class AcademiesController {
  constructor(
    private readonly academies: AcademiesService,
    private readonly videos: AcademyVideosService,
    private readonly share: AcademyShareService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthUser, @Query() q: QueryAcademiesDto) {
    return this.academies.list(user, q);
  }

  /** Las academias que administro (dueño o profesor). */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthUser) {
    return this.academies.mine(user);
  }

  /** Reportes de videos pendientes de revisar. */
  @Get('reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  reports() {
    return this.videos.pendingReports();
  }

  @Post('reports/:reportId/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @HttpCode(204)
  async resolveReport(@Param('reportId') reportId: string) {
    await this.videos.resolveReport(reportId);
  }

  /** Crea una academia (queda como dueño). multipart: `data` (JSON) + `file` (logo, opcional). */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PROFESOR')
  async create(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const { file, fields } = await readMultipart(req);
    const dto = await validateJsonField(CreateAcademyDto, fields.data);
    return this.academies.create(user, dto, file);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academies.findOne(user, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAcademyDto) {
    return this.academies.update(user, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.academies.remove(user, id);
  }

  /** Logo (público, para <img>). 404 si no tiene. */
  @Get(':id/logo')
  async logo(@Param('id') id: string, @Res() reply: FastifyReply) {
    const f = await this.academies.getLogo(id);
    if (!f) {
      reply.code(404).send({ message: 'Esta academia no tiene logo.' });
      return;
    }
    reply.header('Content-Type', f.mime).header('Cache-Control', 'public, max-age=3600').send(f.buffer);
  }

  @Put(':id/logo')
  @UseGuards(JwtAuthGuard)
  async setLogo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: FastifyRequest) {
    const { file } = await readMultipart(req);
    if (!file) throw new BadRequestException('Sube una imagen.');
    return this.academies.setLogo(user, id, file);
  }

  @Delete(':id/logo')
  @UseGuards(JwtAuthGuard)
  clearLogo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academies.setLogo(user, id, null);
  }

  // --- profesores ---------------------------------------------------------------

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  addMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.academies.addMember(user, id, dto);
  }

  @Delete(':id/members/:userId')
  @UseGuards(JwtAuthGuard)
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.academies.removeMember(user, id, userId);
  }

  // --- clases -------------------------------------------------------------------

  @Post(':id/classes')
  @UseGuards(JwtAuthGuard)
  createClass(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateClassDto) {
    return this.academies.createClass(user, id, dto);
  }

  @Patch(':id/classes/:classId')
  @UseGuards(JwtAuthGuard)
  updateClass(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('classId') classId: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.academies.updateClass(user, id, classId, dto);
  }

  @Delete(':id/classes/:classId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async removeClass(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('classId') classId: string) {
    await this.academies.removeClass(user, id, classId);
  }

  // --- link para compartir una clase (dueño y profesores) ---------------------------

  /** Link activo de la clase, o null. */
  @Get(':id/classes/:classId/share')
  @UseGuards(JwtAuthGuard)
  getShare(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('classId') classId: string) {
    return this.share.get(user, id, classId);
  }

  /** Crea el link (si había uno, ese deja de funcionar). */
  @Post(':id/classes/:classId/share')
  @UseGuards(JwtAuthGuard)
  createShare(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('classId') classId: string) {
    return this.share.create(user, id, classId);
  }

  @Delete(':id/classes/:classId/share')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async revokeShare(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('classId') classId: string) {
    await this.share.revoke(user, id, classId);
  }

  // --- videos -------------------------------------------------------------------

  @Get(':id/videos')
  @UseGuards(JwtAuthGuard)
  listVideos(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: ListVideosQueryDto) {
    return this.videos.list(user, id, q);
  }

  /** De las huellas dadas, cuáles ya están en la galería (para no subirlas de nuevo). */
  @Post(':id/videos/duplicates')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  duplicates(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CheckDuplicatesDto) {
    return this.videos.findDuplicates(user, id, dto);
  }

  /** Pide subir un video: devuelve las URLs firmadas para el video y su miniatura. */
  @Post(':id/videos')
  @UseGuards(JwtAuthGuard)
  createUpload(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateVideoUploadDto) {
    return this.videos.createUpload(user, id, dto);
  }

  @Post(':id/videos/:videoId/complete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @Body() dto: CompleteVideoUploadDto,
  ) {
    return this.videos.completeUpload(user, id, videoId, dto);
  }

  @Patch(':id/videos/:videoId')
  @UseGuards(JwtAuthGuard)
  updateVideo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @Body() dto: UpdateVideoDto,
  ) {
    return this.videos.update(user, id, videoId, dto);
  }

  @Delete(':id/videos/:videoId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async removeVideo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('videoId') videoId: string) {
    await this.videos.remove(user, id, videoId);
  }

  /** URL firmada (1 h) para reproducir el video. */
  @Get(':id/videos/:videoId/url')
  @UseGuards(JwtAuthGuard)
  videoUrl(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('videoId') videoId: string) {
    return this.videos.viewUrl(user, id, videoId);
  }

  /** Reemplazar la miniatura: devuelve la URL para subir el cuadro elegido. */
  @Post(':id/videos/:videoId/thumb')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  thumbUpload(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('videoId') videoId: string) {
    return this.videos.thumbUpload(user, id, videoId);
  }

  @Post(':id/videos/:videoId/thumb/complete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  thumbComplete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('videoId') videoId: string) {
    return this.videos.thumbComplete(user, id, videoId);
  }

  /** Descarga del original (dueño y profesores; también lo que está en la bóveda). */
  @Get(':id/videos/:videoId/download')
  @UseGuards(JwtAuthGuard)
  download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @Query('format') format?: string,
  ) {
    // `?format=mp4` = la copia compatible (si existe); por defecto, el original.
    return this.videos.downloadUrl(user, id, videoId, format === 'mp4' ? 'mp4' : 'original');
  }

  // --- bóveda -------------------------------------------------------------------

  @Get(':id/vault')
  @UseGuards(JwtAuthGuard)
  vault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.videos.listVault(user, id);
  }

  /** Mueve archivos de la galería a la bóveda. */
  @Post(':id/vault')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  toVault(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveMediaDto) {
    return this.videos.move(user, id, dto, 'VAULT');
  }

  /** Devuelve archivos de la bóveda a la galería. */
  @Post(':id/vault/restore')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  fromVault(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveMediaDto) {
    return this.videos.move(user, id, dto, 'GALLERY');
  }

  @Post(':id/videos/:videoId/report')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @Body() dto: ReportVideoDto,
  ) {
    await this.videos.report(user, id, videoId, dto);
  }
}
