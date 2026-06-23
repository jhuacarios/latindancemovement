import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DANCE_SUBSTYLES, type DanceSubstyle } from '@baile-latino/types';

export class GeneratePlaylistDto {
  /** % de bachata objetivo (0-100); el resto se llena con salsa. Default 50. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bachataPct?: number;

  @IsOptional()
  @IsArray()
  @IsIn(DANCE_SUBSTYLES, { each: true })
  substyles?: DanceSubstyle[];

  /** Duración objetivo total en minutos (si los tracks tienen duración). */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  targetMinutes?: number;

  /** Máximo de canciones. Default 30. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  maxTracks?: number;

  /** Si true, prioriza por popularidad (solicitudes). Si false, variedad aleatoria. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  byPopularity?: boolean;

  /** Solo canciones aprobadas. Default true. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyApproved?: boolean;

  // --- Persistencia opcional: si se entrega `name`, se guarda como playlist ---
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  eventId?: string;
}
