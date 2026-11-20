import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GifsService } from './gifs.service';

class GifSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  offset?: number;
}

@Controller('gifs')
@UseGuards(JwtAuthGuard)
export class GifsController {
  constructor(private readonly gifs: GifsService) {}

  /** Buscar GIFs (sin `q`: los del momento). `enabled: false` si no hay clave configurada. */
  @Get()
  search(@Query() q: GifSearchDto) {
    return this.gifs.search(q.q, q.offset ?? 0);
  }
}
