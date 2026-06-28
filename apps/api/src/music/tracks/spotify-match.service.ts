import { Injectable } from '@nestjs/common';
import type {
  ExtractedTrackMetadata,
  MatchConfidence,
  SpotifyImportMatch,
} from '@baile-latino/types';
import { SpotifyService, type SpotifyTrackInfo } from './spotify.service';
import { YoutubeMetadataService } from './youtube-metadata.service';

/**
 * Matchea una playlist de Spotify con los mejores videos de YouTube.
 *
 * La meta es elegir la versión **buena para social**: audio limpio, sin intro/
 * charla, duración correcta. Por eso el scoring pesa fuerte la **duración vs.
 * Spotify** (la señal más confiable contra intros/outros/extendidas) y los
 * canales **"- Topic"/Art Track** (audio auto-generado por la disquera = mismo
 * master que Spotify).
 */
@Injectable()
export class SpotifyMatchService {
  constructor(
    private readonly spotify: SpotifyService,
    private readonly youtube: YoutubeMetadataService,
  ) {}

  async matchPlaylist(link: string): Promise<SpotifyImportMatch[]> {
    const tracks = await this.spotify.getPlaylistTracks(link);

    // Concurrencia acotada: cada track gasta cuota de YouTube (search = 100).
    const CHUNK = 4;
    const out: SpotifyImportMatch[] = [];
    for (let i = 0; i < tracks.length; i += CHUNK) {
      const slice = tracks.slice(i, i + CHUNK);
      const matched = await Promise.all(slice.map((sp) => this.matchOne(sp)));
      out.push(...matched);
    }
    return out;
  }

  private async matchOne(sp: SpotifyTrackInfo): Promise<SpotifyImportMatch> {
    const query = [sp.title, sp.artist].filter(Boolean).join(' ');
    let candidates: ExtractedTrackMetadata[] = [];
    try {
      candidates = await this.youtube.search(query, 6);
    } catch {
      candidates = [];
    }

    const scored = candidates
      .map((c) => ({ c, s: scoreCandidate(c, sp) }))
      .sort((a, b) => b.s - a.s);

    const top = scored[0];
    return {
      spotify: {
        title: sp.title,
        artist: sp.artist,
        durationSec: sp.durationSec,
        year: sp.year,
      },
      best: top?.c ?? null,
      candidates: scored.slice(0, 4).map((x) => x.c),
      confidence: top ? confidenceOf(top.s, top.c, sp) : 'none',
    };
  }
}

/** Normaliza un texto: minúsculas, sin acentos, sin puntuación ni adornos. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(feat[^)]*\)|\bfeat\.?\b|\bft\.?\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BAD_LIVE = /\b(live|en vivo|directo|concierto|concert)\b/;
const BAD_VERSION =
  /\b(cover|remix|mashup|mix|megamix|popurri|version karaoke|karaoke|instrumental)\b/;
const BAD_EDIT =
  /\b(reaction|react|tutorial|clase|leccion|how to|sped up|speed up|nightcore|slowed|8d|bass boosted)\b/;
const BAD_NOISE = /\b(intro|outro|skit|interview|entrevista|trailer|teaser)\b/;
const GOOD_AUDIO = /\b(audio|lyric|lyrics|letra)\b/;

/** Puntúa un candidato de YouTube contra el track de Spotify. */
function scoreCandidate(c: ExtractedTrackMetadata, sp: SpotifyTrackInfo): number {
  let score = 0;
  const title = (c.title || '') + ' ' + (c.channelTitle || '');
  const nt = norm(title);
  const ch = (c.channelTitle || '').toLowerCase();

  // 1) Duración vs. Spotify (la señal más fuerte para "versión de social").
  if (c.durationSec && sp.durationSec) {
    const diff = Math.abs(c.durationSec - sp.durationSec);
    if (diff <= 2) score += 50;
    else if (diff <= 5) score += 38;
    else if (diff <= 10) score += 20;
    else if (diff <= 20) score += 5;
    else score -= 35; // muy distinta: intro/charla/extendida/recortada
  }

  // 2) Canal "- Topic" / Art Track = mismo master que Spotify (audio limpio).
  if (/-\s*topic$/.test(ch) || ch.includes('art track')) score += 40;
  if (ch.includes('vevo')) score += 8;

  // 3) Coincidencia de título y artista.
  if (sp.title && nt.includes(norm(sp.title))) score += 22;
  if (sp.artist) {
    const na = norm(sp.artist);
    if (na && (nt.includes(na) || norm(ch).includes(na))) score += 16;
  }

  // 4) Palabras buenas / malas en el título.
  const lt = (c.title || '').toLowerCase();
  if (GOOD_AUDIO.test(lt)) score += 8;
  if (BAD_LIVE.test(lt)) score -= 25;
  if (BAD_VERSION.test(lt)) score -= 22;
  if (BAD_EDIT.test(lt)) score -= 35;
  if (BAD_NOISE.test(lt)) score -= 15;

  // 5) Embebible (si no, no se puede reproducir fuera de YouTube).
  if (c.details?.embeddable === false) score -= 40;

  // 6) Popularidad como desempate suave.
  const views = Number(c.details?.viewCount ?? 0);
  if (views > 0) score += Math.min(8, Math.log10(views));

  return score;
}

/** Traduce el puntaje + señales a una confianza para la UI. */
function confidenceOf(
  score: number,
  c: ExtractedTrackMetadata,
  sp: SpotifyTrackInfo,
): MatchConfidence {
  const ch = (c.channelTitle || '').toLowerCase();
  const isTopic = /-\s*topic$/.test(ch) || ch.includes('art track');
  const durOk =
    !!c.durationSec &&
    !!sp.durationSec &&
    Math.abs(c.durationSec - sp.durationSec) <= 3;

  if (isTopic && durOk) return 'high';
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}
