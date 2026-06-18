import { IsString, MinLength } from 'class-validator';

export class AddCatalogDto {
  @IsString()
  @MinLength(1)
  trackId!: string;
}
