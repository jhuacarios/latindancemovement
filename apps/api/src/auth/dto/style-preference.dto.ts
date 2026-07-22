import { IsIn } from 'class-validator';
import { STYLE_PREFERENCES, type StylePreference } from '@baile-latino/types';

/** Preferencia de baile que el usuario elige al entrar o desde su perfil. */
export class StylePreferenceDto {
  @IsIn(STYLE_PREFERENCES, {
    message: `stylePreference debe ser uno de: ${STYLE_PREFERENCES.join(', ')}`,
  })
  stylePreference!: StylePreference;
}
