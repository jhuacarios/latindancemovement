import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ACADEMY_MEDIA_MIME_TYPES, ACADEMY_VIDEO_MAX_BYTES } from '@baile-latino/types';

export class CreatePlaceMediaUploadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsIn(ACADEMY_MEDIA_MIME_TYPES, { message: 'Formato no permitido. Usa MP4, MOV o WEBM (video) o JPG, PNG o WEBP (foto).' })
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(ACADEMY_VIDEO_MAX_BYTES, { message: 'El video no puede superar 3 GB.' })
  sizeBytes!: number;

  /** Día del social (YYYY-MM-DD). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha en formato YYYY-MM-DD.' })
  recordedOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/, { message: 'Huella del archivo no válida.' })
  contentHash?: string;
}

export class CompletePlaceMediaDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;
}

export class PlaceMediaDuplicatesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^[a-f0-9]{64}$/, { each: true, message: 'Huella del archivo no válida.' })
  hashes!: string[];
}

export class MovePlaceMediaDto {
  @IsIn(['GALLERY', 'VAULT'])
  to!: 'GALLERY' | 'VAULT';
}

export class SetPlaceQuotaDto {
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10_000)
  mediaGb?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10_000)
  vaultGb?: number;
}
