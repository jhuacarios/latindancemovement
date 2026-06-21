import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateYoutubePlaylistDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsIn(['private', 'unlisted', 'public'])
  privacy?: 'private' | 'unlisted' | 'public';
}
