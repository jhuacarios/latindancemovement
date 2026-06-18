import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  DanceStyle,
  DanceSubstyle,
  ExtractedTrackMetadata,
} from '@baile-latino/types';
import { buildTrackUrl, parseTrackLink } from '../track-url.util';

/** Palabras de adorno típicas en títulos de YouTube que conviene limpiar. */
const NOISE = [
  'official video',
  'video oficial',
  'videoclip oficial',
  'official music video',
  'official audio',
  'audio oficial',
  'lyric video',
  'video lyric',
  'letra',
  'lyrics',
  'official',
  'oficial',
  'hd',
  '4k',
  'mv',
  'official lyric video',
  'audio',
  'en vivo',
  'live',
];

@Injectable()
export class YoutubeMetadataService {
  private readonly logger = new Logger(YoutubeMetadataService.name);

  async extract(link: string): Promise<ExtractedTrackMetadata> {
    const parsed = parseTrackLink(link);
    if (!parsed) {
      throw new BadRequestException('Link no reconocido (esperado YouTube).');
    }
    if (parsed.source !== 'YOUTUBE') {
      throw new BadRequestException(
        'Por ahora la autoextracción solo funciona con links de YouTube.',
      );
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    const base = apiKey
      ? await this.fromDataApi(parsed.sourceId, apiKey)
      : await this.fromOembed(parsed.sourceId);

    const haystack = [base.rawTitle, base.channelTitle, base.tags?.join(' ')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const { style, substyle } = this.detectStyle(haystack);
    const { artist, title } = this.splitArtistTitle(
      base.rawTitle,
      base.channelTitle,
    );

    return {
      source: 'YOUTUBE',
      sourceId: parsed.sourceId,
      url: buildTrackUrl('YOUTUBE', parsed.sourceId),
      title,
      artist,
      durationSec: base.durationSec,
      year: base.year,
      coverUrl: base.coverUrl,
      channelTitle: base.channelTitle,
      detectedStyle: style,
      detectedSubstyle: substyle,
      via: base.via,
    };
  }

  // --- YouTube Data API v3 (requiere YOUTUBE_API_KEY) ----------------------
  private async fromDataApi(id: string, apiKey: string) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${id}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`YouTube API ${res.status}; usando oEmbed de respaldo`);
      return this.fromOembed(id);
    }
    const json = (await res.json()) as any;
    const item = json.items?.[0];
    if (!item) throw new BadRequestException('Video de YouTube no encontrado.');
    const sn = item.snippet ?? {};
    return {
      rawTitle: String(sn.title ?? ''),
      channelTitle: sn.channelTitle ? String(sn.channelTitle) : null,
      durationSec: this.parseIsoDuration(item.contentDetails?.duration),
      year: sn.publishedAt ? Number(String(sn.publishedAt).slice(0, 4)) : null,
      coverUrl:
        sn.thumbnails?.high?.url ??
        sn.thumbnails?.medium?.url ??
        sn.thumbnails?.default?.url ??
        null,
      tags: Array.isArray(sn.tags) ? (sn.tags as string[]) : undefined,
      via: 'youtube-api' as const,
    };
  }

  // --- oEmbed (sin API key) ------------------------------------------------
  private async fromOembed(id: string) {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);
    const url = `https://www.youtube.com/oembed?url=${target}&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new BadRequestException(
        'No se pudo obtener la info del video (¿existe o es privado?).',
      );
    }
    const json = (await res.json()) as any;
    return {
      rawTitle: String(json.title ?? ''),
      channelTitle: json.author_name ? String(json.author_name) : null,
      durationSec: null,
      year: null,
      coverUrl: json.thumbnail_url ? String(json.thumbnail_url) : null,
      tags: undefined as string[] | undefined,
      via: 'oembed' as const,
    };
  }

  // --- helpers -------------------------------------------------------------
  private parseIsoDuration(iso?: string): number | null {
    if (!iso) return null;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return null;
    const h = Number(m[1] ?? 0);
    const min = Number(m[2] ?? 0);
    const s = Number(m[3] ?? 0);
    const total = h * 3600 + min * 60 + s;
    return total > 0 ? total : null;
  }

  private cleanTitle(raw: string): string {
    let t = raw
      .replace(/\([^)]*\)/g, ' ') // (...)
      .replace(/\[[^\]]*\]/g, ' ') // [...]
      .replace(/[|/].*/g, ' '); // corta en | o /
    const lower = t.toLowerCase();
    for (const n of NOISE) {
      t = t.replace(new RegExp(`\\b${n}\\b`, 'gi'), ' ');
    }
    void lower;
    return t.replace(/\s+/g, ' ').trim();
  }

  private splitArtistTitle(
    rawTitle: string,
    channelTitle: string | null,
  ): { artist: string | null; title: string } {
    const cleaned = this.cleanTitle(rawTitle);
    // Formato típico "Artista - Título"
    const dash = cleaned.split(/\s[-–—]\s/);
    if (dash.length >= 2) {
      return {
        artist: dash[0].trim() || null,
        title: dash.slice(1).join(' - ').trim(),
      };
    }
    // Sin guion: artista = canal (limpio de VEVO / "- Topic")
    const artist = channelTitle
      ? channelTitle.replace(/VEVO$/i, '').replace(/\s*-\s*Topic$/i, '').trim()
      : null;
    return { artist: artist || null, title: cleaned || rawTitle };
  }

  private detectStyle(haystack: string): {
    style: DanceStyle | null;
    substyle: DanceSubstyle | null;
  } {
    let style: DanceStyle | null = null;
    let substyle: DanceSubstyle | null = null;

    if (haystack.includes('bachata')) {
      style = 'BACHATA';
      if (haystack.includes('sensual')) substyle = 'BACHATA_SENSUAL';
      else if (haystack.includes('tradicional')) substyle = 'BACHATA_TRADICIONAL';
      else if (haystack.includes('urbana')) substyle = 'BACHATA_URBANA';
    } else if (haystack.includes('salsa')) {
      style = 'SALSA';
      if (haystack.includes('cubana') || haystack.includes('casino'))
        substyle = 'SALSA_CUBANA';
      else if (haystack.includes('on2') || haystack.includes('on 2'))
        substyle = 'SALSA_ON2';
      else if (haystack.includes('on1') || haystack.includes('on 1'))
        substyle = 'SALSA_ON1';
    }
    return { style, substyle };
  }
}
