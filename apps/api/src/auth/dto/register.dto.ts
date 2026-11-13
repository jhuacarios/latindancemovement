import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DANCE_STYLES, type DanceStyle } from '@baile-latino/types';

/**
 * Registro público. No hay campo de rol: toda cuenta nueva entra como PILOTO
 * (o SUPER_ADMIN si el email está en `SUPER_ADMIN_EMAILS`). El rol solo lo
 * cambia un super admin desde Administración.
 */
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
