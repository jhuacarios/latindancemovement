import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CHILE_REGION_CODES,
  DANCE_STYLES,
  USER_ROLES,
  type ChileRegion,
  type DanceStyle,
  type UserRole,
} from '@baile-latino/types';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsIn(USER_ROLES)
  role!: UserRole;

  @IsOptional()
  @IsIn(CHILE_REGION_CODES)
  region?: ChileRegion | null;

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
  @IsArray()
  @IsIn(DANCE_STYLES, { each: true })
  styles?: DanceStyle[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(CHILE_REGION_CODES)
  region?: ChileRegion | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string | null;

  /** Comuna dentro de la ciudad (se valida contra CHILE_CITIES). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  commune?: string | null;
}
