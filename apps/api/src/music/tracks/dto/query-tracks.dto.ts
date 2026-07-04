import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  DANCE_STYLES,
  TRACK_APPROVAL_STATUSES,
  TRACK_SOURCES,
  type DanceStyle,
  type TrackApprovalStatus,
  type TrackSource,
} from '@baile-latino/types';

export class QueryTracksDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(DANCE_STYLES)
  style?: DanceStyle;

  @IsOptional()
  @IsString()
  substyle?: string;

  /** Varios sub-estilos (CSV); se combinan con OR. */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((s) => s.trim()).filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  substyles?: string[];

  @IsOptional()
  @IsIn(TRACK_SOURCES)
  source?: TrackSource;

  @IsOptional()
  @IsIn(TRACK_APPROVAL_STATUSES)
  approvalStatus?: TrackApprovalStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRelease?: boolean;

  /** Excluye del catálogo las canciones que ya están en Mi biblioteca. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  excludeMine?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize?: number = 50;

  @IsOptional()
  @IsIn(['recent', 'title', 'artist', 'popularity'])
  sort?: 'recent' | 'title' | 'artist' | 'popularity' = 'recent';

  /** Columna por la que ordenar (click en el header). */
  @IsOptional()
  @IsIn(['title', 'artist', 'year', 'releaseDate', 'createdAt', 'views'])
  sortBy?: 'title' | 'artist' | 'year' | 'releaseDate' | 'createdAt' | 'views';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
