import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Datos del perfil que el usuario edita él mismo. `null` / vacío = borrar. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 letras.' })
  @MaxLength(80)
  name?: string;

  /** Pseudónimo: lo que ve la comunidad. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  /** "@cuenta", "cuenta" o el link del perfil; se normaliza a "cuenta". */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  instagramHandle?: string | null;

  /** Cumpleaños: día y mes juntos (sin año). `null` en ambos = borrar. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  birthDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  birthMonth?: number | null;

  /** En cualquier formato; el service valida el dígito verificador y lo normaliza. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string | null;
}
