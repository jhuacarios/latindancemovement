import { BadRequestException } from '@nestjs/common';

/**
 * Máximo de duración permitido al IMPORTAR una canción a la plataforma: 10 min.
 * Un video/track de más de 10 minutos casi nunca es una sola canción (suele ser
 * un mix, set de DJ o álbum completo), así que se rechaza en cualquier flujo de
 * importación (catálogo, Mis Canciones, import de playlists, Excel, etc.).
 */
export const MAX_TRACK_DURATION_SEC = 600;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Lanza 400 si la canción supera el máximo. Si `durationSec` es null/undefined
 * (aún no se conoce la duración) no bloquea — la validación corre donde la
 * duración ya está disponible.
 */
export function assertImportableDuration(
  durationSec: number | null | undefined,
): void {
  if (durationSec != null && durationSec > MAX_TRACK_DURATION_SEC) {
    throw new BadRequestException(
      `La canción dura ${fmt(durationSec)} y supera el máximo de ${fmt(
        MAX_TRACK_DURATION_SEC,
      )} permitido para importar. Los videos de más de 10 minutos suelen ser ` +
        `mixes o sets, no una sola canción.`,
    );
  }
}
