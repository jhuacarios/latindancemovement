import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DANCE_STYLES, STUDIO_AUDIO_MIME_TYPES, type DanceStyle } from '@baile-latino/types';

export class CreateUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsIn(STUDIO_AUDIO_MIME_TYPES, { message: 'Formato no permitido. Usa MP3, M4A, WAV o FLAC.' })
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  trackId?: string;

  /** Estilo con que se va a estudiar (Estudio → Bachata / Salsa). Por defecto bachata. */
  @IsOptional()
  @IsIn(DANCE_STYLES)
  style?: DanceStyle;

  /** El usuario declara tener derecho a usar el archivo para su práctica personal. */
  @IsBoolean()
  @Equals(true, { message: 'Debes declarar que tienes derecho a usar este archivo.' })
  rightsAccepted!: boolean;
}

export class SetFirstBeatDto {
  /** Momento del "1" en ms (se ajusta al beat más cercano). null = volver al automático. */
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  timeMs!: number | null;
}

export class ListAudioFilesQueryDto {
  @IsOptional()
  @IsIn(DANCE_STYLES)
  style?: DanceStyle;
}
