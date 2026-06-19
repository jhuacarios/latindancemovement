import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { TagsService } from './tags.service';
import { CreateTagDto, SetTrackTagsDto, UpdateTagDto } from './dto/tag.dto';

@Controller('music')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  // --- Vocabulario --------------------------------------------------------
  @Get('tags')
  list() {
    return this.tags.listVocabulary();
  }

  /** Crear un tag (un DJ puede; si ya existe normalizado, se reutiliza). */
  @Post('tags')
  create(@Body() dto: CreateTagDto, @CurrentUser() user: AuthUser) {
    return this.tags.create(dto.name, dto.style ?? null, user.id);
  }

  @Patch('tags/:id')
  @Roles('SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Delete('tags/:id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }

  // --- Asociación por canción --------------------------------------------
  @Get('tracks/:trackId/tags')
  getTrackTags(
    @Param('trackId') trackId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tags.getTrackTags(trackId, user.id);
  }

  @Put('tracks/:trackId/tags')
  setTrackTags(
    @Param('trackId') trackId: string,
    @Body() dto: SetTrackTagsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tags.setTrackTags(trackId, user.id, dto.tagIds);
  }
}
