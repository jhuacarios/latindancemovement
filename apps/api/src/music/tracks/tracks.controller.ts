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
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackDto } from './dto/update-track.dto';
import { QueryTracksDto } from './dto/query-tracks.dto';
import { ImportTracksDto } from './dto/import-tracks.dto';

@Controller('music/tracks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TracksController {
  constructor(
    private readonly tracks: TracksService,
    private readonly exporter: TracksExportService,
    private readonly excelImporter: TracksImportExcelService,
  ) {}

  @Get()
  findAll(@Query() q: QueryTracksDto) {
    return this.tracks.findAll(q);
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

  /** Carga masiva subiendo un archivo Excel (.xlsx). */
  @Post('import-excel')
  @Roles('DJ', 'ORGANIZADOR')
  async importExcel(@Req() req: FastifyRequest, @CurrentUser() user: AuthUser) {
    const file = await req.file();
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    const buffer = await file.toBuffer();
    return this.excelImporter.importBuffer(buffer, user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tracks.findOne(id);
  }

  @Post()
  @Roles('DJ', 'ORGANIZADOR', 'ARTISTA')
  create(@Body() dto: CreateTrackDto, @CurrentUser() user: AuthUser) {
    return this.tracks.create(dto, user.id);
  }

  /** Carga masiva por JSON (upsert por link/fuente). */
  @Post('import')
  @Roles('DJ', 'ORGANIZADOR')
  import(@Body() dto: ImportTracksDto, @CurrentUser() user: AuthUser) {
    return this.tracks.importMany(dto.tracks, user.id);
  }

  @Patch(':id')
  @Roles('DJ', 'ORGANIZADOR')
  update(@Param('id') id: string, @Body() dto: UpdateTrackDto) {
    return this.tracks.update(id, dto);
  }

  @Delete(':id')
  @Roles('DJ', 'ORGANIZADOR')
  remove(@Param('id') id: string) {
    return this.tracks.remove(id);
  }
}
