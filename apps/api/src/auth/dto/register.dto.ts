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
  DANCE_STYLES,
  USER_ROLES,
  type DanceStyle,
  type UserRole,
} from '@baile-latino/types';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // límite de bcrypt
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  instagramHandle?: string;

  @IsOptional()
  @IsArray()
  @IsIn(DANCE_STYLES, { each: true })
  styles?: DanceStyle[];
}
