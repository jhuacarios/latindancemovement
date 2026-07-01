import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { PlaylistsService } from './playlists.service';
import { PlaylistGenerationService } from './playlist-generation.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { AddItemDto } from './dto/add-item.dto';
import { ReorderDto } from './dto/reorder.dto';
import { GeneratePlaylistDto } from './dto/generate-playlist.dto';

@Controller('music/playlists')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlaylistsController {
  constructor(
    private readonly playlists: PlaylistsService,
    private readonly generation: PlaylistGenerationService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('source') source?: 'YOUTUBE' | 'SPOTIFY',
  ) {
    return this.playlists.findAllForUser(user, source);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.playlists.findOne(id);
  }

  @Post()
  @Roles('DJ', 'ORGANIZADOR')
  create(@Body() dto: CreatePlaylistDto, @CurrentUser() user: AuthUser) {
    return this.playlists.create(dto, user.id);
  }

  /** Genera una playlist automática por filtros/recomendaciones. Persiste si se envía `name`. */
  @Post('generate')
  @Roles('DJ', 'ORGANIZADOR')
  generate(@Body() dto: GeneratePlaylistDto, @CurrentUser() user: AuthUser) {
    return this.generation.generate(dto, user);
  }

  @Patch(':id')
  @Roles('DJ', 'ORGANIZADOR')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlaylistDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.playlists.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('DJ', 'ORGANIZADOR')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.playlists.remove(id, user);
  }

  @Post(':id/items')
  @Roles('DJ', 'ORGANIZADOR')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.playlists.addItem(id, dto, user);
  }

  @Delete(':id/items/:itemId')
  @Roles('DJ', 'ORGANIZADOR')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.playlists.removeItem(id, itemId, user);
  }

  @Patch(':id/reorder')
  @Roles('DJ', 'ORGANIZADOR')
  reorder(
    @Param('id') id: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.playlists.reorder(id, dto, user);
  }
}
