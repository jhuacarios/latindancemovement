import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PermissionsService } from './permissions.service';
import { SavePermissionsDto } from './dto/save-permissions.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly permissions: PermissionsService) {}

  /** Matriz de permisos guardada (cualquier usuario autenticado puede leerla). */
  @Get('permissions')
  async getPermissions() {
    return { matrix: await this.permissions.get() };
  }

  /** Guarda la matriz de permisos. Solo SUPER_ADMIN. */
  @Put('permissions')
  @Roles('SUPER_ADMIN')
  async savePermissions(@Body() dto: SavePermissionsDto) {
    return { matrix: await this.permissions.set(dto.matrix) };
  }
}
