import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CHILE_REGION_CODES,
  DANCE_STYLES,
  EVENT_STATUSES,
  type ChileRegion,
  type DanceStyle,
  type EventStatus,
} from '@baile-latino/types';

export class CreateEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  /** ISO 8601 con zona (el web manda la hora local de Chile convertida a ISO). */
  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsIn(CHILE_REGION_CODES)
  region!: ChileRegion;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  venueName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(DANCE_STYLES, { each: true })
  styles?: DanceStyle[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bachataPct?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  priceInfo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ticketUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instagramUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  organizerName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  organizerInstagram?: string | null;

  @IsOptional()
  @IsIn(EVENT_STATUSES)
  status?: EventStatus;
}
