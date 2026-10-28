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
import { EventsService } from './events.service';
import { FlyerExtractService } from './flyer-extract.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { readMultipart, validateJsonField } from '../common/multipart';

@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly extractor: FlyerExtractService,
  ) {}

  /** Eventos agrupados por región de Chile, con conteo de próximos por sección. */
  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query() q: QueryEventsDto) {
    return this.events.listByRegion(q);
  }

  /**
   * Lee un flyer (+ texto opcional del post) con Claude y devuelve los datos
   * para prellenar el formulario. No crea nada.
   * multipart: `file` (imagen) + `text` (opcional).
   */
  @Post('extract')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZADOR', 'VENUE')
  async extract(@Req() req: FastifyRequest) {
    const { file, fields } = await readMultipart(req);
    if (!file) throw new BadRequestException('Sube la imagen del flyer.');
    return this.extractor.extract(file, fields.text);
  }

  /** Publica un evento. multipart: `data` (JSON de CreateEventDto) + `file` (flyer, opcional). */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZADOR', 'VENUE')
  async create(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const { file, fields } = await readMultipart(req);
    const dto = await validateJsonField(CreateEventDto, fields.data);
    return this.events.create(user, dto, file);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.events.findOne(id);
  }

  /** Sirve el flyer (público, para <img>). 404 si el evento no tiene. */
  @Get(':id/flyer')
  async flyer(@Param('id') id: string, @Res() reply: FastifyReply) {
    const f = await this.events.getFlyer(id);
    if (!f) {
      reply.code(404).send({ message: 'Este evento no tiene flyer.' });
      return;
    }
    reply
      .header('Content-Type', f.mime)
      .header('Cache-Control', 'public, max-age=3600')
      .send(f.buffer);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(user, id, dto);
  }

  /** Reemplaza el flyer. multipart: `file`. */
  @Put(':id/flyer')
  @UseGuards(JwtAuthGuard)
  async setFlyer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    const { file } = await readMultipart(req);
    if (!file) throw new BadRequestException('Sube la imagen del flyer.');
    return this.events.setFlyer(user, id, file);
  }

  @Delete(':id/flyer')
  @UseGuards(JwtAuthGuard)
  clearFlyer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.events.setFlyer(user, id, null);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.events.remove(user, id);
  }
}
