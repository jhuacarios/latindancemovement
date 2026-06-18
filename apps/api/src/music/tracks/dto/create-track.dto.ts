import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  DANCE_STYLES,
  DANCE_SUBSTYLES,
  TRACK_APPROVAL_STATUSES,
  TRACK_SOURCES,
  type DanceStyle,
  type DanceSubstyle,
  type TrackApprovalStatus,
  type TrackSource,
} from '@baile-latino/types';

export class CreateTrackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  artist!: string;

  @IsIn(DANCE_STYLES)
  style!: DanceStyle;

  @IsOptional()
  @IsIn(DANCE_SUBSTYLES)
  substyle?: DanceSubstyle;

  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(260)
  bpm?: number;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  /**
   * Pega un link de Spotify/YouTube y se resuelve source + sourceId.
   * Alternativa: enviar `source` + `sourceId` directamente.
   */
  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsIn(TRACK_SOURCES)
  source?: TrackSource;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  durationSec?: number;

  @IsOptional()
  @IsBoolean()
  isRelease?: boolean;

  @IsOptional()
  @IsIn(TRACK_APPROVAL_STATUSES)
  approvalStatus?: TrackApprovalStatus;

  @IsOptional()
  @IsString()
  artistUserId?: string;
}
