import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
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

  /**
   * Estilo elegido por fila en el preview: { sourceId: estilo }.
   * Pisa al detectado/por defecto. Valores inválidos se ignoran.
   */
  @IsOptional()
  @IsObject()
  overrides?: Record<string, DanceStyle>;
}
