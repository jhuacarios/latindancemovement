import { Injectable } from '@nestjs/common';
import type { Prisma, Track as PrismaTrack } from '@prisma/client';
import {
  SUBSTYLE_TO_STYLE,
  type DanceStyle,
  type Playlist,
  type PlaylistGenerationResult,
  type PlaylistGenerationSummary,
} from '@baile-latino/types';
import type { AuthUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { toPublicTrack } from '../mappers';
import { PlaylistsService } from './playlists.service';
import { GeneratePlaylistDto } from './dto/generate-playlist.dto';
import { interleavePattern } from '../youtube/playlist-pattern.util';

const DEFAULT_MAX_TRACKS = 30;
const ASSUMED_DURATION_SEC = 210; // si una canción no tiene duración registrada

@Injectable()
export class PlaylistGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly playlists: PlaylistsService,
  ) {}

  async generate(
    dto: GeneratePlaylistDto,
    user: AuthUser,
  ): Promise<PlaylistGenerationResult> {
    const onlyApproved = dto.onlyApproved ?? true;
    const byPopularity = dto.byPopularity ?? false;

    // Modo bloques: bachataCount/salsaCount son el patrón POR BLOQUE (ej: 5
    // bachatas + 3 salsas) que se repite hasta el límite (máx canciones o
    // duración). Si no llegan, se usa el modo viejo (% + máx canciones).
    const useBlocks = dto.bachataCount != null || dto.salsaCount != null;

    let selected: PrismaTrack[];
    let bachataPct: number;
    let maxTracks: number;

    if (useBlocks) {
      const bpb = Math.max(0, dto.bachataCount ?? 0); // bachatas por bloque
      const spb = Math.max(0, dto.salsaCount ?? 0); // salsas por bloque
      const perBlock = bpb + spb;
      bachataPct = perBlock ? Math.round((bpb / perBlock) * 100) : 50;

      // Cuántas canciones apuntamos a traer (con holgura para formar bloques).
      const targetTracks = dto.targetMinutes
        ? Math.ceil((dto.targetMinutes * 60) / ASSUMED_DURATION_SEC) + perBlock
        : (dto.maxTracks ?? DEFAULT_MAX_TRACKS);
      const blocks = perBlock ? Math.ceil(targetTracks / perBlock) + 1 : 0;

      const [bachata, salsa] = await Promise.all([
        this.pick('BACHATA', bpb * blocks, dto, onlyApproved, byPopularity, user.id),
        this.pick('SALSA', spb * blocks, dto, onlyApproved, byPopularity, user.id),
      ]);

      // Arma bloques repetidos [bpb bachatas, spb salsas] (solo bloques completos).
      selected = interleavePattern(bachata, salsa, bpb, spb);
      if (dto.targetMinutes) {
        selected = this.trimToDuration(selected, dto.targetMinutes * 60);
      } else if (dto.maxTracks) {
        selected = selected.slice(0, dto.maxTracks);
      }
      maxTracks = selected.length;
    } else {
      // Compatibilidad: % bachata + máx canciones, intercalado proporcional.
      bachataPct = this.clamp(dto.bachataPct ?? 50, 0, 100);
      maxTracks = dto.maxTracks ?? DEFAULT_MAX_TRACKS;
      const nBachata = Math.round((maxTracks * bachataPct) / 100);
      const nSalsa = maxTracks - nBachata;
      const [bachata, salsa] = await Promise.all([
        this.pick('BACHATA', nBachata, dto, onlyApproved, byPopularity, user.id),
        this.pick('SALSA', nSalsa, dto, onlyApproved, byPopularity, user.id),
      ]);
      selected = this.interleave(bachata, salsa);
      if (dto.targetMinutes) {
        selected = this.trimToDuration(selected, dto.targetMinutes * 60);
      }
    }

    const summary = this.summarize(selected, { bachataPct, maxTracks, byPopularity });

    let playlist: Playlist | null = null;
    if (dto.name) {
      playlist = await this.persist(dto, selected, bachataPct, user);
    }

    return { tracks: selected.map(toPublicTrack), summary, playlist };
  }

  private async pick(
    style: DanceStyle,
    n: number,
    dto: GeneratePlaylistDto,
    onlyApproved: boolean,
    byPopularity: boolean,
    userId: string,
  ): Promise<PrismaTrack[]> {
    if (n <= 0) return [];

    // Solo de "Mis Canciones" (biblioteca del usuario).
    const where: Prisma.TrackWhereInput = {
      style,
      savedBy: { some: { userId } },
    };
    if (onlyApproved) where.approvalStatus = 'APROBADA';

    const subs = (dto.substyles ?? []).filter(
      (s) => SUBSTYLE_TO_STYLE[s] === style,
    );
    if (subs.length) where.substyle = { in: subs };

    if (byPopularity) {
      // Recomendación: más solicitadas primero.
      return this.prisma.track.findMany({
        where,
        orderBy: [{ songRequests: { _count: 'desc' } }, { createdAt: 'desc' }],
        take: n,
      });
    }

    // Variedad: trae un pool y baraja.
    const pool = await this.prisma.track.findMany({ where, take: 500 });
    return this.shuffle(pool).slice(0, n);
  }

  /** Mezcla proporcional bachata/salsa para que la lista quede repartida. */
  private interleave(a: PrismaTrack[], b: PrismaTrack[]): PrismaTrack[] {
    const result: PrismaTrack[] = [];
    const total = a.length + b.length;
    let ia = 0;
    let ib = 0;
    for (let k = 0; k < total; k++) {
      // Toma de la lista que esté más "atrasada" respecto a su cuota.
      const takeA =
        ib >= b.length ||
        (ia < a.length && ia / a.length <= ib / Math.max(b.length, 1));
      if (takeA) result.push(a[ia++]);
      else result.push(b[ib++]);
    }
    return result;
  }

  private trimToDuration(tracks: PrismaTrack[], targetSec: number): PrismaTrack[] {
    const out: PrismaTrack[] = [];
    let acc = 0;
    for (const t of tracks) {
      out.push(t);
      acc += t.durationSec ?? ASSUMED_DURATION_SEC;
      if (acc >= targetSec) break;
    }
    return out;
  }

  private summarize(
    tracks: PrismaTrack[],
    req: { bachataPct: number; maxTracks: number; byPopularity: boolean },
  ): PlaylistGenerationSummary {
    const bachataCount = tracks.filter((t) => t.style === 'BACHATA').length;
    const salsaCount = tracks.length - bachataCount;
    const estSec = tracks.reduce(
      (s, t) => s + (t.durationSec ?? ASSUMED_DURATION_SEC),
      0,
    );
    return {
      requested: req,
      trackCount: tracks.length,
      bachataCount,
      salsaCount,
      actualBachataPct: tracks.length
        ? Math.round((bachataCount / tracks.length) * 100)
        : 0,
      estimatedMinutes: Math.round(estSec / 60),
    };
  }

  private async persist(
    dto: GeneratePlaylistDto,
    tracks: PrismaTrack[],
    bachataPct: number,
    user: AuthUser,
  ): Promise<Playlist> {
    const playlist = await this.prisma.playlist.create({
      data: {
        name: dto.name!,
        eventId: dto.eventId ?? null,
        status: 'BORRADOR',
        targetBachataPct: bachataPct,
        ownerId: user.id,
        items: {
          create: tracks.map((t, idx) => ({
            trackId: t.id,
            position: idx + 1,
            addedById: user.id,
          })),
        },
      },
    });
    return this.playlists.findOne(playlist.id);
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
