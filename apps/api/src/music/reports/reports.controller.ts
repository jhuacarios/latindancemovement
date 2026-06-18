import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('music/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DJ', 'ORGANIZADOR')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Resumen del catálogo: totales por estilo, sub-estilo, fuente y estado. */
  @Get('catalog')
  catalog() {
    return this.reports.catalogSummary();
  }

  /** Ranking de canciones más solicitadas. */
  @Get('top-requested')
  topRequested(@Query('limit') limit?: string) {
    const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20;
    return this.reports.topRequested(n);
  }

  /** Reporte de una playlist (mix real vs objetivo, duración, warmup). */
  @Get('playlist/:id')
  playlist(@Param('id') id: string) {
    return this.reports.playlistReport(id);
  }
}
