import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class MergeTracksDto {
  /** Id de la canción que se conserva. */
  @IsString()
  @MinLength(1)
  keepId!: string;

  /** Ids de las canciones duplicadas a eliminar (referencias reasignadas a keepId). */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  removeIds!: string[];
}
