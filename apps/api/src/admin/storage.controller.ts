import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { StorageService } from './storage.service';

class StorageLimitsDto {
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100_000)
  dbGb?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100_000)
  r2Gb?: number;
}

/** Admin → Almacenamiento. Solo SUPER_ADMIN. */
@Controller('admin/storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** `?refresh=1` vuelve a medir (si no, se usa lo medido hace < 5 min). */
  @Get()
  report(@Query('refresh') refresh?: string) {
    return this.storage.report(refresh === '1' || refresh === 'true');
  }

  @Put('limits')
  setLimits(@Body() dto: StorageLimitsDto) {
    return this.storage.setLimits(dto);
  }
}
