import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReorderDto {
  /** IDs de PlaylistItem en el nuevo orden deseado. */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  itemIds!: string[];
}
