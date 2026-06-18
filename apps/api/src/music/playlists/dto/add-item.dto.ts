import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddItemDto {
  @IsString()
  trackId!: string;

  /** Posición (1-based). Si se omite, se agrega al final. */
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isWarmup?: boolean;
}
