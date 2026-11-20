import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { STICKER_PACK_SCOPES, type StickerPackScope } from '@baile-latino/types';

export class StickerOwnerQueryDto {
  @IsIn(STICKER_PACK_SCOPES as unknown as string[])
  scope!: StickerPackScope;

  @IsOptional()
  @IsString()
  academyId?: string;

  @IsOptional()
  @IsString()
  placeId?: string;
}

export class CreateStickerPackDto extends StickerOwnerQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;
}

export class RenameStickerPackDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;
}
