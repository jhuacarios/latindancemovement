import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DANCE_STYLES, type DanceStyle, type UserRole } from '@baile-latino/types';

/**
 * Roles que una persona puede elegir al registrarse. SUPER_ADMIN solo lo da la
 * allowlist `SUPER_ADMIN_EMAILS`; ORGANIZADOR y VENUE los asigna un admin
 * (habilitan funciones con costo, como leer flyers con IA).
 */
export const SELF_REGISTER_ROLES = [
  'PILOTO',
  'BAILARIN',
  'PROFESOR',
  'DJ',
  'ARTISTA',
  'COREOGRAFO',
  'FILMMAKER',
] as const satisfies readonly UserRole[];
export type SelfRegisterRole = (typeof SELF_REGISTER_ROLES)[number];

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
  @IsIn(SELF_REGISTER_ROLES, { message: 'Rol no permitido en el registro' })
  role?: SelfRegisterRole;

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
