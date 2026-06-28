import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  DanceStyle,
  DanceSubstyle,
  ExtractedTrackMetadata,
  YoutubeDetails,
} from '@baile-latino/types';
import { buildTrackUrl, parseTrackLink } from '../track-url.util';
import { SpotifyService } from './spotify.service';
import { DiscogsService } from './discogs.service';

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

  constructor(
    private readonly spotify: SpotifyService,
    private readonly discogs: DiscogsService,
  ) {}

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

    return this.applyExternalStyle(this.toExtracted(parsed.sourceId, base));
  }

  /** Lee una playlist pública de YouTube y devuelve la metadata de cada video. */
  async extractPlaylist(link: string): Promise<ExtractedTrackMetadata[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'Importar playlists requiere configurar YOUTUBE_API_KEY.',
      );
    }
    const playlistId = this.parsePlaylistId(link);
    if (!playlistId) {
      throw new BadRequestException(
        'No se reconoció una playlist de YouTube en el link.',
      );
    }

    const videoIds = await this.fetchPlaylistVideoIds(playlistId, apiKey);
    if (!videoIds.length) {
      throw new BadRequestException(
        'La playlist está vacía o no es pública.',
      );
    }

    const out: ExtractedTrackMetadata[] = [];
    // videos.list acepta hasta 50 ids por llamada.
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status,topicDetails&id=${chunk.join(',')}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as any;
      for (const item of json.items ?? []) {
        out.push(this.toExtracted(String(item.id), this.buildVideoData(item)));
      }
    }
    return this.enrichManyExternal(out);
  }

  /** Trae la metadata de varios videos por id (videos.list, 1 unidad de cuota). */
  async fetchByIds(ids: string[]): Promise<ExtractedTrackMetadata[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey || !ids.length) return [];
    const out: ExtractedTrackMetadata[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status,topicDetails&id=${chunk.join(',')}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as any;
      for (const item of json.items ?? []) {
        out.push(this.toExtracted(String(item.id), this.buildVideoData(item)));
      }
    }
    return out;
  }

  /**
   * Busca videos en YouTube por texto y devuelve candidatos enriquecidos
   * (con duración/canal/stats para poder puntuarlos). `search.list` cuesta
   * 100 unidades de cuota; `videos.list` 1.
   */
  async search(query: string, max = 6): Promise<ExtractedTrackMetadata[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('Buscar requiere YOUTUBE_API_KEY.');
    }
    const q = encodeURIComponent(query);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${max}&q=${q}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const ids: string[] = (json.items ?? [])
      .map((i: any) => i.id?.videoId)
      .filter(Boolean);
    return this.fetchByIds(ids);
  }

  /**
   * Enriquece el estilo/año con fuentes externas, por lotes para no saturar
   * las APIs. Si ninguna fuente está habilitada, no hace nada.
   */
  private async enrichManyExternal(
    items: ExtractedTrackMetadata[],
  ): Promise<ExtractedTrackMetadata[]> {
    if ((!this.spotify.enabled && !this.discogs.enabled) || !items.length) {
      return items;
    }
    const CHUNK = 5;
    const result = [...items];
    for (let i = 0; i < result.length; i += CHUNK) {
      const slice = result.slice(i, i + CHUNK);
      const enriched = await Promise.all(
        slice.map((it) => this.applyExternalStyle(it)),
      );
      for (let j = 0; j < enriched.length; j++) result[i + j] = enriched[j];
    }
    return result;
  }

  /**
   * Cascada de detección: Spotify (año + género mainstream) → Discogs
   * (campo "Style", ideal para música cubana) → señales de YouTube
   * (lo ya detectado). El año real del álbum pisa al de subida a YouTube.
   */
  private async applyExternalStyle(
    item: ExtractedTrackMetadata,
  ): Promise<ExtractedTrackMetadata> {
    const sp = await this.spotify.lookup(item.title, item.artist);
    let style = sp?.style ?? null;
    let substyle = sp?.style ? (sp.substyle ?? null) : null;
    let year = sp?.year ?? null;

    // Discogs solo si Spotify no resolvió el estilo (su "Style" es más certero
    // para géneros cubanos que Spotify no etiqueta).
    if (!style) {
      const dc = await this.discogs.lookup(item.title, item.artist);
      if (dc?.style) {
        style = dc.style;
        substyle = dc.substyle;
      }
      year = year ?? dc?.year ?? null;
    }

    return {
      ...item,
      detectedStyle: style ?? item.detectedStyle,
      detectedSubstyle: style ? (substyle ?? item.detectedSubstyle) : item.detectedSubstyle,
      year: year ?? item.year,
    };
  }

  /** Normaliza un "base" (de la API/oEmbed) a la forma extraída final. */
  private toExtracted(
    sourceId: string,
    base: VideoBase,
  ): ExtractedTrackMetadata {
    const topics = (base.details.topicCategories ?? [])
      .map(decodeTopicUrl)
      .join(' ');
    const haystack = [
      base.rawTitle,
      base.channelTitle,
      base.tags?.join(' '),
      base.details.description,
      topics,
    ]
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
      sourceId,
      url: buildTrackUrl('YOUTUBE', sourceId),
      title,
      artist,
      durationSec: base.durationSec,
      year: base.year,
      coverUrl: base.coverUrl,
      channelTitle: base.channelTitle,
      detectedStyle: style,
      detectedSubstyle: substyle,
      via: base.via,
      details: base.details,
    };
  }

  private parsePlaylistId(link: string): string | null {
    const m = link.match(/[?&]list=([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  /** Trae los videoIds de una playlist (paginado, tope 200). */
  private async fetchPlaylistVideoIds(
    playlistId: string,
    apiKey: string,
  ): Promise<string[]> {
    const ids: string[] = [];
    let pageToken = '';
    for (let page = 0; page < 4; page++) {
      const url =
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50` +
        `&playlistId=${playlistId}&key=${apiKey}` +
        (pageToken ? `&pageToken=${pageToken}` : '');
      const res = await fetch(url);
      if (!res.ok) break;
      const json = (await res.json()) as any;
      for (const it of json.items ?? []) {
        const vid = it.contentDetails?.videoId;
        if (vid) ids.push(String(vid));
      }
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    return ids;
  }

  // --- YouTube Data API v3 (requiere YOUTUBE_API_KEY) ----------------------
  private async fromDataApi(id: string, apiKey: string) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status,topicDetails&id=${id}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`YouTube API ${res.status}; usando oEmbed de respaldo`);
      return this.fromOembed(id);
    }
    const json = (await res.json()) as any;
    const item = json.items?.[0];
    if (!item) throw new BadRequestException('Video de YouTube no encontrado.');
    return this.buildVideoData(item);
  }

  /** Arma los datos base + details desde un item de videos.list. */
  private buildVideoData(item: any): VideoBase {
    const sn = item.snippet ?? {};
    const cd = item.contentDetails ?? {};
    const st = item.statistics ?? {};
    const status = item.status ?? {};
    const td = item.topicDetails ?? {};

    const details: YoutubeDetails = {
      description: sn.description ?? null,
      channelId: sn.channelId ?? null,
      channelTitle: sn.channelTitle ?? null,
      categoryId: sn.categoryId ?? null,
      publishedAt: sn.publishedAt ?? null,
      tags: Array.isArray(sn.tags) ? (sn.tags as string[]) : undefined,
      defaultAudioLanguage: sn.defaultAudioLanguage ?? sn.defaultLanguage ?? null,
      definition: cd.definition ?? null,
      dimension: cd.dimension ?? null,
      caption: cd.caption != null ? String(cd.caption) === 'true' : null,
      licensedContent:
        typeof cd.licensedContent === 'boolean' ? cd.licensedContent : null,
      viewCount: st.viewCount ?? null,
      likeCount: st.likeCount ?? null,
      commentCount: st.commentCount ?? null,
      privacyStatus: status.privacyStatus ?? null,
      embeddable: typeof status.embeddable === 'boolean' ? status.embeddable : null,
      madeForKids: typeof status.madeForKids === 'boolean' ? status.madeForKids : null,
      license: status.license ?? null,
      uploadStatus: status.uploadStatus ?? null,
      topicCategories: Array.isArray(td.topicCategories)
        ? (td.topicCategories as string[])
        : undefined,
      via: 'youtube-api',
      fetchedAt: new Date().toISOString(),
    };

    return {
      rawTitle: String(sn.title ?? ''),
      channelTitle: sn.channelTitle ? String(sn.channelTitle) : null,
      durationSec: this.parseIsoDuration(cd.duration),
      year: sn.publishedAt ? Number(String(sn.publishedAt).slice(0, 4)) : null,
      coverUrl:
        sn.thumbnails?.high?.url ??
        sn.thumbnails?.medium?.url ??
        sn.thumbnails?.default?.url ??
        null,
      tags: Array.isArray(sn.tags) ? (sn.tags as string[]) : undefined,
      via: 'youtube-api',
      details,
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
    const details: YoutubeDetails = {
      channelTitle: json.author_name ? String(json.author_name) : null,
      via: 'oembed',
      fetchedAt: new Date().toISOString(),
    };
    return {
      rawTitle: String(json.title ?? ''),
      channelTitle: json.author_name ? String(json.author_name) : null,
      durationSec: null,
      year: null,
      coverUrl: json.thumbnail_url ? String(json.thumbnail_url) : null,
      tags: undefined as string[] | undefined,
      via: 'oembed' as const,
      details,
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

    // Géneros cubanos que implican salsa cubana (timba y familia).
    const cuban = [
      'timba',
      'son cubano',
      'son montuno',
      'guaracha',
      'songo',
      'charanga',
      'casino',
    ];
    const hasCuban = cuban.some((k) => haystack.includes(k));

    if (haystack.includes('bachata')) {
      style = 'BACHATA';
      if (haystack.includes('sensual')) substyle = 'BACHATA_SENSUAL';
      else if (haystack.includes('tradicional')) substyle = 'BACHATA_TRADICIONAL';
      else if (haystack.includes('urbana')) substyle = 'BACHATA_URBANA';
    } else if (haystack.includes('salsa') || hasCuban) {
      style = 'SALSA';
      if (haystack.includes('cubana') || hasCuban) substyle = 'SALSA_CUBANA';
      else if (haystack.includes('on2') || haystack.includes('on 2'))
        substyle = 'SALSA_ON2';
      else if (haystack.includes('on1') || haystack.includes('on 1'))
        substyle = 'SALSA_ON1';
    }
    return { style, substyle };
  }
}

/** "https://en.wikipedia.org/wiki/Salsa_music" -> "salsa music". */
function decodeTopicUrl(url: string): string {
  const seg = url.split('/wiki/')[1] ?? '';
  try {
    return decodeURIComponent(seg).replace(/_/g, ' ');
  } catch {
    return seg.replace(/_/g, ' ');
  }
}

/** Datos "base" de un video (API o oEmbed) antes de normalizar. */
interface VideoBase {
  rawTitle: string;
  channelTitle: string | null;
  durationSec: number | null;
  year: number | null;
  coverUrl: string | null;
  tags?: string[];
  via: 'youtube-api' | 'oembed';
  details: YoutubeDetails;
}
