import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class StartConversationDto {
  /** Usuario con quien abrir (o retomar) la conversación. */
  @IsString()
  @MinLength(1)
  userId!: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class ListMessagesDto {
  /** Id del mensaje más antiguo ya cargado: devuelve los anteriores a ese. */
  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SearchUsersDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
