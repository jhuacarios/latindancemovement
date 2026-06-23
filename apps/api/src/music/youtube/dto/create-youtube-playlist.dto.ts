import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { YoutubePlaylistOrder } from '@baile-latino/types';

export class CreateYoutubePlaylistDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsIn(['private', 'unlisted', 'public'])
  privacy?: 'private' | 'unlisted' | 'public';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  bachataPerBlock?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  salsaPerBlock?: number;

  @IsOptional()
  @IsIn(['bachata', 'salsa'])
  order?: YoutubePlaylistOrder;
}

/** Sólo los campos del patrón (para el preview vía query string). */
export class YoutubePatternQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  bachataPerBlock?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  salsaPerBlock?: number;

  @IsOptional()
  @IsIn(['bachata', 'salsa'])
  order?: YoutubePlaylistOrder;
}
