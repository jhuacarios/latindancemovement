import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { PlaceMediaService } from './place-media.service';
import {
  CompletePlaceMediaDto,
  CreatePlaceMediaUploadDto,
  MovePlaceMediaDto,
  PlaceMediaDuplicatesDto,
  SetPlaceQuotaDto,
} from './dto/place-media.dto';

/** Fotos y videos de un social: ven los miembros; gestiona el administrador. */
@Controller('community/places/:placeId/media')
@UseGuards(JwtAuthGuard)
export class PlaceMediaController {
  constructor(private readonly media: PlaceMediaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string) {
    return this.media.list(user, placeId);
  }

  @Get('vault')
  vault(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string) {
    return this.media.listVault(user, placeId);
  }

  @Post('duplicates')
  @HttpCode(200)
  duplicates(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string, @Body() dto: PlaceMediaDuplicatesDto) {
    return this.media.duplicates(user, placeId, dto.hashes);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string, @Body() dto: CreatePlaceMediaUploadDto) {
    return this.media.createUpload(user, placeId, dto);
  }

  @Post(':mediaId/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('placeId') placeId: string,
    @Param('mediaId') mediaId: string,
    @Body() dto: CompletePlaceMediaDto,
  ) {
    return this.media.completeUpload(user, placeId, mediaId, dto.durationMs);
  }

  @Get(':mediaId/url')
  url(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string, @Param('mediaId') mediaId: string) {
    return this.media.viewUrl(user, placeId, mediaId);
  }

  @Get(':mediaId/download')
  download(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string, @Param('mediaId') mediaId: string) {
    return this.media.downloadUrl(user, placeId, mediaId);
  }

  @Post(':mediaId/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: AuthUser,
    @Param('placeId') placeId: string,
    @Param('mediaId') mediaId: string,
    @Body() dto: MovePlaceMediaDto,
  ) {
    return this.media.move(user, placeId, mediaId, dto.to);
  }

  @Delete(':mediaId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string, @Param('mediaId') mediaId: string) {
    await this.media.remove(user, placeId, mediaId);
  }

  /** Cupos del social (versión gratis 5 + 20 GB). Solo SUPER_ADMIN. */
  @Patch('quota')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  quota(@Param('placeId') placeId: string, @Body() dto: SetPlaceQuotaDto) {
    return this.media.setQuota(placeId, dto);
  }
}
