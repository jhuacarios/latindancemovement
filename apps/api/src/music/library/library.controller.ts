import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { LibraryService } from './library.service';
import { AddCatalogDto } from './dto/add-catalog.dto';
import { CreateTrackDto } from '../tracks/dto/create-track.dto';
import { QueryTracksDto } from '../tracks/dto/query-tracks.dto';

@Controller('music/library')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DJ', 'ORGANIZADOR', 'SUPER_ADMIN')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  /** Mis Canciones (seleccionadas del catálogo + personales). */
  @Get()
  list(@Query() q: QueryTracksDto, @CurrentUser() user: AuthUser) {
    return this.library.listMine(user.id, q);
  }

  /** IDs en mi biblioteca (para marcar toggles en el catálogo). */
  @Get('ids')
  ids(@CurrentUser() user: AuthUser) {
    return this.library.myTrackIds(user.id);
  }

  /** Agregar una canción del catálogo a mis canciones. */
  @Post()
  addCatalog(@Body() dto: AddCatalogDto, @CurrentUser() user: AuthUser) {
    return this.library.addCatalog(user.id, dto.trackId);
  }

  /** Agregar una canción personal (privada, por link). No entra al catálogo. */
  @Post('personal')
  addPersonal(@Body() dto: CreateTrackDto, @CurrentUser() user: AuthUser) {
    return this.library.addPersonal(user.id, dto);
  }

  /** Quitar de mis canciones (si es personal mía, se elimina). */
  @Delete(':trackId')
  remove(@Param('trackId') trackId: string, @CurrentUser() user: AuthUser) {
    return this.library.remove(user.id, trackId);
  }
}
