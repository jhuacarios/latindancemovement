import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SettingsService } from './settings.service';

/** Formatos aceptados para el logo. */
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

@Controller('settings/site')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Info pública del sitio (nombre, si hay logo, cuándo se actualizó). */
  @Get()
  info() {
    return this.settings.info();
  }

  /** Sirve el logo (público, para <img> en web/login/mobile). 404 si no hay. */
  @Get('logo')
  async logo(@Res() reply: FastifyReply) {
    const logo = await this.settings.getLogo();
    if (!logo) {
      reply.code(404).send({ message: 'Sin logo configurado.' });
      return;
    }
    reply.header('Content-Type', logo.mime).send(logo.buffer);
  }

  /** Sube/reemplaza el logo (solo SUPER_ADMIN). */
  @Post('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  async upload(@Req() req: FastifyRequest) {
    const file = await req.file();
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'Formato no permitido. Usa PNG, JPG, WEBP o SVG.',
      );
    }
    const buffer = await file.toBuffer();
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException('El logo no puede superar 2 MB.');
    }
    return this.settings.setLogo(buffer, file.mimetype);
  }

  /** Elimina el logo (vuelve al fallback). Solo SUPER_ADMIN. */
  @Delete('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  remove() {
    return this.settings.clearLogo();
  }
}
