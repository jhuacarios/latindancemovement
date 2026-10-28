import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { CHILE_REGION_CODES, type ChileRegion } from '@baile-latino/types';

export class QueryEventsDto {
  /** Incluir eventos ya realizados (por defecto solo próximos). */
  @IsOptional()
  @IsBoolean()
  includePast?: boolean;

  @IsOptional()
  @IsIn(CHILE_REGION_CODES)
  region?: ChileRegion;
}
