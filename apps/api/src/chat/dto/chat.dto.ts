import { CHAT_REACTIONS } from '@baile-latino/types';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
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

export class ReactDto {
  /** Emoji de CHAT_REACTIONS; null (o el mismo que ya tenía) quita la reacción. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(CHAT_REACTIONS as unknown as string[], { message: 'Esa reacción no está disponible.' })
  emoji?: string | null;
}

export class ReactionChangesDto {
  /** `now` de la consulta anterior (ISO). Sin él, solo devuelve la hora. */
  @IsOptional()
  @IsString()
  since?: string;
}
