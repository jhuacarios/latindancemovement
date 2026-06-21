import { Type } from 'class-transformer';
import {
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(40)
  @Max(260)
  bpmMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(40)
  @Max(260)
  bpmMax?: number;

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
  @IsIn(['recent', 'title', 'artist', 'bpm', 'popularity'])
  sort?: 'recent' | 'title' | 'artist' | 'bpm' | 'popularity' = 'recent';

  /** Columna por la que ordenar (click en el header). */
  @IsOptional()
  @IsIn(['title', 'artist', 'bpm', 'year', 'createdAt'])
  sortBy?: 'title' | 'artist' | 'bpm' | 'year' | 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
