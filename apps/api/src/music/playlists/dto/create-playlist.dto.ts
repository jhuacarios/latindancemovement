import {
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
  PLAYLIST_STATUSES,
  PLAYLIST_VISIBILITIES,
  type PlaylistStatus,
  type PlaylistVisibility,
} from '@baile-latino/types';

export class CreatePlaylistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsIn(PLAYLIST_STATUSES)
  status?: PlaylistStatus;

  @IsOptional()
  @IsIn(PLAYLIST_VISIBILITIES)
  visibility?: PlaylistVisibility;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  targetBachataPct?: number;

  /** Patrón de distribución: bachatas por bloque. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  bachatasPerBlock?: number;

  /** Patrón de distribución: salsas por bloque. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  salsasPerBlock?: number;
}
