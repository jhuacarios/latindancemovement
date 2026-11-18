import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ACADEMY_MEDIA_MIME_TYPES,
  ACADEMY_VIDEO_MAX_BYTES,
  CHILE_REGION_CODES,
  CLASS_LEVELS,
  DANCE_STYLES,
  type ChileRegion,
  type ClassLevel,
  type DanceStyle,
} from '@baile-latino/types';

export class CreateAcademyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(CHILE_REGION_CODES)
  region!: ChileRegion;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(DANCE_STYLES, { each: true })
  styles?: DanceStyle[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^@?[A-Za-z0-9._]{1,30}$/, { message: 'Usuario de Instagram no válido.' })
  @ValidateIf((_o, v) => v !== null && v !== '')
  instagramHandle?: string | null;
}

export class UpdateAcademyDto extends PartialType(CreateAcademyDto) {}

export class QueryAcademiesDto {
  @IsOptional()
  @IsIn(CHILE_REGION_CODES)
  region?: ChileRegion;
}

export class AddMemberDto {
  @IsEmail({}, { message: 'Escribe el correo con que el profesor entra a Nectason.' })
  email!: string;
}

export class CreateClassDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(DANCE_STYLES)
  style?: DanceStyle | null;

  @IsOptional()
  @IsIn(CLASS_LEVELS)
  level?: ClassLevel;

  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Hora en formato HH:mm.' })
  startTime!: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(600)
  durationMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  teacherName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  priceInfo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {}

export class CreateVideoUploadDto {
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

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  classId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(DANCE_STYLES)
  style?: DanceStyle | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha en formato YYYY-MM-DD.' })
  recordedOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** SHA-256 (hex) del archivo: si ya está en la galería de la academia, no se sube. */
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/, { message: 'Huella del archivo no válida.' })
  contentHash?: string;
}

/** Huellas de los archivos que se van a subir, para saltar los que ya están. */
export class CheckDuplicatesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^[a-f0-9]{64}$/, { each: true, message: 'Huella del archivo no válida.' })
  hashes!: string[];
}

/** Archivos a mover entre la galería y la bóveda. */
export class MoveMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  videoIds!: string[];
}

export class CompleteVideoUploadDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;
}

export class UpdateVideoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  classId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(DANCE_STYLES)
  style?: DanceStyle | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha en formato YYYY-MM-DD.' })
  recordedOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class ListVideosQueryDto {
  @IsOptional()
  @IsString()
  classId?: string;
}

export class ReportVideoDto {
  @IsString()
  @MinLength(5, { message: 'Cuéntanos brevemente el motivo.' })
  @MaxLength(1000)
  reason!: string;
}

/** Admin → Academias: Plan Director y cupos. Lo que no venga no se cambia. */
export class SetAcademyPlanDto {
  /** Vigente hasta ese día (YYYY-MM-DD); null = quitar el plan (solo lectura). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha en formato YYYY-MM-DD.' })
  expiresAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  storageQuotaGb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20000)
  vaultQuotaGb?: number;
}
