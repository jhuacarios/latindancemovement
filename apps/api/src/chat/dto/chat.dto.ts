import {
  CHAT_POLL_MAX_OPTIONS,
  CHAT_POLL_MIN_OPTIONS,
  CHAT_POLL_OPTION_MAX,
  CHAT_POLL_QUESTION_MAX,
  CHAT_REACTIONS,
} from '@baile-latino/types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class SendStickerDto {
  @IsString()
  @MinLength(1)
  stickerId!: string;
}

export class SendGifDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  gifId!: string;
}

export class CreatePollDto {
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_POLL_QUESTION_MAX)
  question!: string;

  @IsArray()
  @ArrayMinSize(CHAT_POLL_MIN_OPTIONS)
  @ArrayMaxSize(CHAT_POLL_MAX_OPTIONS)
  @IsString({ each: true })
  @MaxLength(CHAT_POLL_OPTION_MAX, { each: true })
  options!: string[];

  @IsOptional()
  @IsBoolean()
  multiple?: boolean;
}

export class VoteDto {
  /** Opciones que marco (reemplaza mi voto anterior); vacío = quitar mi voto. */
  @IsArray()
  @ArrayMaxSize(CHAT_POLL_MAX_OPTIONS)
  @IsString({ each: true })
  optionIds!: string[];
}

export class PinDto {
  /** Mensaje a fijar; null lo desfija. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  messageId?: string | null;
}
