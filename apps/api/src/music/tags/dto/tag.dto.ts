import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DANCE_STYLES, type DanceStyle } from '@baile-latino/types';

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsIn(DANCE_STYLES)
  style?: DanceStyle;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn([...DANCE_STYLES, null])
  style?: DanceStyle | null;
}

export class SetTrackTagsDto {
  @IsArray()
  @IsString({ each: true })
  tagIds!: string[];
}
