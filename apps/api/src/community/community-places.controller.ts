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
import { CommunityPlacesService } from './community-places.service';
import {
  CreateCommunityPlaceDto,
  QueryCommunityPlacesDto,
  UpdateCommunityPlaceDto,
} from './dto/community-place.dto';

/** Lugares recurrentes de la comunidad: sociales al aire libre, salsotecas… (`kind`). */
@Controller('community/places')
export class CommunityPlacesController {
  constructor(private readonly places: CommunityPlacesService) {}

  /** Lugares de un tipo agrupados por región, con conteo por sección. `?kind=` obligatorio. */
  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query() q: QueryCommunityPlacesDto) {
    return this.places.listByRegion(q);
  }

  /** Agrega un lugar. multipart: `data` (JSON) + `file` (foto, opcional). */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZADOR', 'VENUE', 'PROFESOR', 'DJ')
  async create(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const { file, fields } = await readMultipart(req);
    const dto = await validateJsonField(CreateCommunityPlaceDto, fields.data);
    return this.places.create(user, dto, file);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.places.findOne(id);
  }

  /** Foto del lugar (pública, para <img>). 404 si no tiene. */
  @Get(':id/photo')
  async photo(@Param('id') id: string, @Res() reply: FastifyReply) {
    const f = await this.places.getPhoto(id);
    if (!f) {
      reply.code(404).send({ message: 'Este lugar no tiene foto.' });
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
    @Body() dto: UpdateCommunityPlaceDto,
  ) {
    return this.places.update(user, id, dto);
  }

  @Put(':id/photo')
  @UseGuards(JwtAuthGuard)
  async setPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    const { file } = await readMultipart(req);
    if (!file) throw new BadRequestException('Sube una imagen.');
    return this.places.setPhoto(user, id, file);
  }

  @Delete(':id/photo')
  @UseGuards(JwtAuthGuard)
  clearPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.places.setPhoto(user, id, null);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.places.remove(user, id);
  }
}
