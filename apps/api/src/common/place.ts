import { BadRequestException } from '@nestjs/common';
import { resolvePlace } from '@baile-latino/types';

export interface PlaceFields {
  region?: string | null;
  city?: string | null;
  commune?: string | null;
}

/**
 * Valida la ubicación Región → Ciudad → Comuna de un create/update.
 *
 * - Si el DTO no toca región, ciudad ni comuna, devuelve `undefined` (no cambia nada).
 * - Si cambia la ciudad sin mandar comuna, la comuna se limpia (salvo que la
 *   ciudad tenga una sola, que se completa sola).
 * - Si cambia solo la región, la ciudad/comuna anteriores deben seguir siendo
 *   de esa región; si no, error.
 *
 * Lanza 400 si la ciudad no es de la región o la comuna no es de la ciudad.
 */
export function placeData(
  dto: PlaceFields,
  current?: PlaceFields | null,
): { city: string | null; commune: string | null } | undefined {
  if (dto.region === undefined && dto.city === undefined && dto.commune === undefined) {
    return undefined;
  }
  const region = dto.region !== undefined ? dto.region : current?.region;
  const city = dto.city !== undefined ? dto.city : current?.city;
  const commune =
    dto.commune !== undefined
      ? dto.commune
      : dto.city !== undefined
        ? null
        : current?.commune;
  const r = resolvePlace(region, city, commune);
  if ('error' in r) throw new BadRequestException(r.error);
  return r;
}
