import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CHILE_REGION_CODES,
  COMMUNITY_PLACE_KINDS,
  DANCE_STYLES,
  type ChileRegion,
  type CommunityPlaceKind,
  type DanceStyle,
} from '@baile-latino/types';

export class CreateCommunityPlaceDto {
  @IsIn(COMMUNITY_PLACE_KINDS)
  kind!: CommunityPlaceKind;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @IsIn(CHILE_REGION_CODES)
  region!: ChileRegion;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string | null;

  /** Comuna dentro de la ciudad (se valida contra CHILE_CITIES). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  commune?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  place?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  /** Punto en el mapa (WGS84). Se mandan los dos o ninguno (null = quitar). */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;

  /** % de bachata (0–100); el resto es salsa. Define también `styles`. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bachataPct?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  schedule?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(DANCE_STYLES, { each: true })
  styles?: DanceStyle[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** Handles de Instagram sin @ (letras, números, punto y guion bajo). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @Matches(/^@?[A-Za-z0-9._]{1,30}$/, { each: true, message: 'Cada cuenta de Instagram debe ser un handle válido (ej. bachatalovers.cl).' })
  instagramHandles?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** El tipo (`kind`) no se cambia al editar. */
export class UpdateCommunityPlaceDto extends PartialType(
  OmitType(CreateCommunityPlaceDto, ['kind'] as const),
) {}

export class QueryCommunityPlacesDto {
  @IsIn(COMMUNITY_PLACE_KINDS)
  kind!: CommunityPlaceKind;

  /** Incluir los marcados como inactivos (pausados). */
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @IsIn(CHILE_REGION_CODES)
  region?: ChileRegion;
}

/** Asignar (correo) o quitar (null / vacío) el administrador del lugar. */
export class SetPlaceAdminDto {
  @IsOptional()
  @IsEmail({}, { message: 'Escribe un correo válido.' })
  email?: string | null;
}
