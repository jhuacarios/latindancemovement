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
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { readMultipart } from '../common/multipart';
import { StickersService } from './stickers.service';
import { StickerCutoutService } from './sticker-cutout.service';
import { CreateStickerPackDto, RenameStickerPackDto, StickerOwnerQueryDto } from './stickers.dto';

@Controller('stickers')
export class StickersController {
  constructor(
    private readonly stickers: StickersService,
    private readonly cutouts: StickerCutoutService,
  ) {}

  /** Los packs que puedo usar en el chat. */
  @Get('packs')
  @UseGuards(JwtAuthGuard)
  available(@CurrentUser() user: AuthUser) {
    return this.stickers.available(user);
  }

  /** Packs de un dueño, para administrarlos (Nectason, una academia o un social). */
  @Get('packs/manage')
  @UseGuards(JwtAuthGuard)
  ofOwner(@CurrentUser() user: AuthUser, @Query() q: StickerOwnerQueryDto) {
    return this.stickers.ofOwner(user, q);
  }

  @Post('packs')
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStickerPackDto) {
    return this.stickers.createPack(user, dto);
  }

  @Patch('packs/:id')
  @UseGuards(JwtAuthGuard)
  rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RenameStickerPackDto) {
    return this.stickers.renamePack(user, id, dto.name);
  }

  @Delete('packs/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async removePack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.stickers.removePack(user, id);
  }

  /**
   * Recorta una foto según el contorno dibujado a mano (no guarda nada).
   * multipart: `file` (la foto), `polygon` (JSON [[x,y],...] en 0..1) y `mode` (smart | manual).
   */
  @Post('cutout')
  @UseGuards(JwtAuthGuard)
  async cutout(@Req() req: FastifyRequest) {
    const { file, fields } = await readMultipart(req);
    if (!file) throw new BadRequestException('Sube la foto.');
    return this.cutouts.cutout(file, fields.polygon, fields.mode);
  }

  /** Agrega un sticker a "Mis stickers" (los crea cualquiera). multipart: `file` (máx. 512 KB). */
  @Post('mine')
  @UseGuards(JwtAuthGuard)
  async addMine(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const { file } = await readMultipart(req);
    if (!file) throw new BadRequestException('Sube la imagen del sticker.');
    return this.stickers.addMine(user, file);
  }

  /** Agrega un sticker al pack. multipart: `file` (PNG, WebP, GIF o JPG; máx. 512 KB). */
  @Post('packs/:id/stickers')
  @UseGuards(JwtAuthGuard)
  async add(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: FastifyRequest) {
    const { file } = await readMultipart(req);
    if (!file) throw new BadRequestException('Sube la imagen del sticker.');
    return this.stickers.addSticker(user, id, file);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  removeSticker(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stickers.removeSticker(user, id);
  }

  /** Imagen del sticker (pública; no cambia nunca, se cachea largo). */
  @Get(':id/image')
  async image(@Param('id') id: string, @Res() reply: FastifyReply) {
    const f = await this.stickers.image(id);
    if (!f) {
      reply.code(404).send({ message: 'Sticker no encontrado.' });
      return;
    }
    reply
      .header('Content-Type', f.mime)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(f.buffer);
  }
}
