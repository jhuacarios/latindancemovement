import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DANCE_STYLES, type DanceStyle } from '@baile-latino/types';

/** Una canción ya resuelta de Spotify (del preview) para importar al catálogo. */
export class SpotifyResolvedTrackDto {
  @IsString()
  sourceId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  artist?: string | null;

  @IsOptional()
  @IsInt()
  durationSec?: number | null;

  @IsOptional()
  @IsInt()
  year?: number | null;

  @IsOptional()
  @IsString()
  coverUrl?: string | null;

  @IsOptional()
  @IsIn(DANCE_STYLES)
  detectedStyle?: DanceStyle | null;

  @IsOptional()
  @IsBoolean()
  playable?: boolean | null;
}

export class SpotifyCatalogImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpotifyResolvedTrackDto)
  items!: SpotifyResolvedTrackDto[];

  /** Estilo elegido por canción (sourceId -> estilo), pisa lo detectado. */
  @IsOptional()
  overrides?: Record<string, DanceStyle>;
}
