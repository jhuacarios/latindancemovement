import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  STICKER_CUTOUT_MODES,
  type StickerCutoutMode,
  type StickerCutoutResponse,
} from '@baile-latino/types';
import type { UploadedImage } from '../common/multipart';
import { postJson } from '../common/post-json';

/** El recorte tarda ~1-3 s; si el analizador está ocupado con otro, espera un poco. */
const CUTOUT_TIMEOUT_MS = 60_000;
const MAX_POINTS = 4000;

/**
 * Recorte a mano de stickers: lo hace el analizador Python (`POST /cutout`), que
 * con `smart` ajusta el borde al objeto que la persona encerró con el dedo.
 */
@Injectable()
export class StickerCutoutService {
  private readonly logger = new Logger(StickerCutoutService.name);

  async cutout(file: UploadedImage, rawPolygon: string | undefined, rawMode: string | undefined): Promise<StickerCutoutResponse> {
    const url = process.env.ANALYZER_URL?.replace(/\/$/, '');
    const token = process.env.ANALYZER_TOKEN;
    if (!url || !token) throw new ServiceUnavailableException('El recorte de stickers no está disponible.');

    const mode = (rawMode || 'smart') as StickerCutoutMode;
    if (!STICKER_CUTOUT_MODES.includes(mode)) throw new BadRequestException('Modo de recorte inválido.');
    const polygon = parsePolygon(rawPolygon);

    let res: { status: number; body: unknown };
    try {
      res = await postJson(
        `${url}/cutout`,
        { image: file.buffer.toString('base64'), polygon, mode },
        { Authorization: `Bearer ${token}` },
        CUTOUT_TIMEOUT_MS,
      );
    } catch (e) {
      this.logger.warn(`Recorte falló: ${(e as Error).message}`);
      throw new ServiceUnavailableException('No se pudo recortar ahora. Intenta de nuevo en un rato.');
    }
    if (res.status === 422) {
      const detail = (res.body as { detail?: unknown } | null)?.detail;
      throw new UnprocessableEntityException(typeof detail === 'string' ? detail : 'No se pudo recortar esa foto.');
    }
    const body = res.body as { image?: unknown; bordered?: unknown; smart?: unknown; busy?: unknown } | null;
    if (res.status !== 200 || typeof body?.image !== 'string' || typeof body.bordered !== 'string') {
      this.logger.warn(`El analizador respondió HTTP ${res.status} al recortar.`);
      throw new ServiceUnavailableException('No se pudo recortar ahora. Intenta de nuevo en un rato.');
    }
    return {
      image: `data:image/png;base64,${body.image}`,
      bordered: `data:image/png;base64,${body.bordered}`,
      smart: body.smart === true,
      busy: body.busy === true,
    };
  }
}

/** `[[x,y],...]` con valores entre 0 y 1 (relativos a la foto). */
export function parsePolygon(raw: string | undefined): [number, number][] {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? '');
  } catch {
    throw new BadRequestException('Falta el contorno del recorte.');
  }
  const ok =
    Array.isArray(v) &&
    v.length >= 3 &&
    v.length <= MAX_POINTS &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -0.1 && n <= 1.1),
    );
  if (!ok) throw new BadRequestException('Contorno inválido: dibuja alrededor de lo que quieres recortar.');
  return v as [number, number][];
}
