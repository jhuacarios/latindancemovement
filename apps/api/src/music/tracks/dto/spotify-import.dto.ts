import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DANCE_STYLES, type DanceStyle } from '@baile-latino/types';

export class SpotifyPreviewDto {
  @IsString()
  @MinLength(1)
  link!: string;
}

class SpotifySelectionDto {
  /** videoId de YouTube elegido para esta canción. */
  @IsString()
  @MinLength(1)
  sourceId!: string;

  @IsIn(DANCE_STYLES)
  style!: DanceStyle;
}

export class SpotifyImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpotifySelectionDto)
  selections!: SpotifySelectionDto[];
}
