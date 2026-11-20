import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GifDto, GifSearchResponse } from '@baile-latino/types';

const GIPHY = 'https://api.giphy.com/v1/gifs';
const PAGE = 24;
const CACHE_MS = 10 * 60_000;
/** Solo se aceptan GIFs servidos por GIPHY (nunca URLs arbitrarias en el chat). */
const GIPHY_MEDIA = /^https:\/\/media\d*\.giphy\.com\//;

type GiphyImage = { url?: string; webp?: string; mp4?: string; width?: string; height?: string };
type GiphyGif = {
  id: string;
  title?: string;
  images?: { fixed_width?: GiphyImage; fixed_width_small?: GiphyImage; original?: GiphyImage };
};

/**
 * GIFs para el chat vía GIPHY. La clave vive solo en la API (GIPHY_API_KEY); los
 * clientes nunca la ven. Contenido filtrado a PG-13. Respuestas en caché 10 min
 * para cuidar la cuota. Para cambiar de proveedor (p. ej. KLIPY) basta con este
 * servicio: el resto del sistema usa `GifDto`.
 */
@Injectable()
export class GifsService {
  private readonly logger = new Logger(GifsService.name);
  private readonly cache = new Map<string, { at: number; value: GifSearchResponse }>();

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('GIPHY_API_KEY'));
  }

  private toDto(g: GiphyGif): GifDto | null {
    const img = g.images?.fixed_width;
    const small = g.images?.fixed_width_small ?? img;
    const url = img?.webp || img?.url;
    if (!url || !GIPHY_MEDIA.test(url)) return null;
    return {
      id: g.id,
      title: g.title ?? '',
      url,
      previewUrl: small?.webp || small?.url || url,
      width: Number(img?.width) || 200,
      height: Number(img?.height) || 200,
    };
  }

  private async call(path: string, params: Record<string, string>): Promise<{ data: unknown; pagination?: { offset: number; count: number; total_count: number } }> {
    const key = this.config.get<string>('GIPHY_API_KEY');
    if (!key) throw new ServiceUnavailableException('Los GIFs todavía no están activados.');
    const q = new URLSearchParams({ api_key: key, rating: 'pg-13', lang: 'es', bundle: 'messaging_non_clips', ...params });
    const res = await fetch(`${GIPHY}${path}?${q}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      this.logger.warn(`GIPHY ${path} respondió ${res.status}`);
      throw new ServiceUnavailableException(
        res.status === 429 ? 'Se alcanzó el límite de búsquedas de GIFs. Prueba en un rato.' : 'No se pudieron cargar los GIFs.',
      );
    }
    return (await res.json()) as { data: unknown; pagination?: { offset: number; count: number; total_count: number } };
  }

  /** Búsqueda (o los del momento si `q` está vacío), paginada por `offset`. */
  async search(q: string | undefined, offset = 0): Promise<GifSearchResponse> {
    if (!this.enabled) return { enabled: false, gifs: [], nextOffset: null };
    const term = (q ?? '').trim().toLowerCase().slice(0, 50);
    const key = `${term}|${offset}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const r = term
      ? await this.call('/search', { q: term, limit: String(PAGE), offset: String(offset) })
      : await this.call('/trending', { limit: String(PAGE), offset: String(offset) });
    const gifs = ((r.data as GiphyGif[]) ?? []).map((g) => this.toDto(g)).filter((g): g is GifDto => g !== null);
    const p = r.pagination;
    const next = p && p.offset + p.count < Math.min(p.total_count, 500) ? p.offset + p.count : null;
    const value: GifSearchResponse = { enabled: true, gifs, nextOffset: next };
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  /** Un GIF por id (para guardarlo en un mensaje con una URL confiable). */
  async byId(id: string): Promise<GifDto> {
    if (!/^[A-Za-z0-9]{1,40}$/.test(id)) throw new NotFoundException('GIF no encontrado.');
    const r = await this.call(`/${id}`, {});
    const g = this.toDto(r.data as GiphyGif);
    if (!g) throw new NotFoundException('GIF no encontrado.');
    return g;
  }
}
