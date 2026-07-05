import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  DANCE_STYLES,
  TRACK_APPROVAL_STATUSES,
  TRACK_SOURCES,
  type DanceStyle,
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
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  substyles?: string[];

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  /**
   * Fecha de lanzamiento "YYYY-MM-DD" | "YYYY-MM" | "YYYY". Si viene, pisa la
   * fecha de subida de YouTube (el usuario editó mes/año en el formulario).
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}(-\d{2}(-\d{2})?)?$/)
  releaseDate?: string;

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

  /** JSON con todos los datos de YouTube (del autocompletar). */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  ytMetadata?: string;
}
