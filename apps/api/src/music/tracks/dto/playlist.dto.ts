import { IsIn, IsString, MinLength } from 'class-validator';
import { DANCE_STYLES, type DanceStyle } from '@baile-latino/types';

export class PlaylistPreviewDto {
  @IsString()
  @MinLength(1)
  link!: string;
}

export class ImportPlaylistDto {
  @IsString()
  @MinLength(1)
  link!: string;

  /** Estilo por defecto para las canciones cuyo estilo no se detecte. */
  @IsIn(DANCE_STYLES)
  defaultStyle!: DanceStyle;
}
