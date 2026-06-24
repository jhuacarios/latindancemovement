import { IsString, MinLength } from 'class-validator';

export class GoogleExchangeDto {
  @IsString()
  @MinLength(10)
  code!: string;
}
