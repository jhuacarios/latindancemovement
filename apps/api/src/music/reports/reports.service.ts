import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CatalogSummary,
  DanceStyle,
  PlaylistReport,
  TopTrack,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';

const ASSUMED_DURATION_SEC = 210;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async catalogSummary(): Promise<CatalogSummary> {
    const [total, byStyle, bySubstyle, bySource, byApproval, releases] =
      await Promise.all([
        this.prisma.track.count(),
        this.prisma.track.groupBy({ by: ['style'], _count: { _all: true } }),
        this.prisma.track.groupBy({ by: ['substyle'], _count: { _all: true } }),
        this.prisma.track.groupBy({ by: ['source'], _count: { _all: true } }),
        this.prisma.track.groupBy({
          by: ['approvalStatus'],
          _count: { _all: true },
        }),
        this.prisma.track.count({ where: { isRelease: true } }),
      ]);

    const toMap = (
      rows: { _count: { _all: number } }[],
      key: string,
    ): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const r of rows) {
        const k = (r as Record<string, unknown>)[key];
        out[k == null ? 'SIN_DEFINIR' : String(k)] = r._count._all;
      }
      return out;
    };

    return {
      totalTracks: total,
      byStyle: toMap(byStyle, 'style'),
      bySubstyle: toMap(bySubstyle, 'substyle'),
      bySource: toMap(bySource, 'source'),
      byApprovalStatus: toMap(byApproval, 'approvalStatus'),
      releases,
    };
  }

  async topRequested(limit = 20): Promise<TopTrack[]> {
    const rows = await this.prisma.track.findMany({
      include: { _count: { select: { songRequests: true } } },
      orderBy: { songRequests: { _count: 'desc' } },
      take: limit,
    });
    return rows
      .filter((r) => r._count.songRequests > 0)
      .map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        style: r.style as DanceStyle,
        requestCount: r._count.songRequests,
      }));
  }

  async playlistReport(playlistId: string): Promise<PlaylistReport> {
    const p = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { items: { include: { track: true } } },
    });
    if (!p) throw new NotFoundException('Playlist no encontrada');

    const tracks = p.items.map((i) => i.track);
    const bachataCount = tracks.filter((t) => t.style === 'BACHATA').length;
    const salsaCount = tracks.length - bachataCount;
    const estSec = tracks.reduce(
      (s, t) => s + (t.durationSec ?? ASSUMED_DURATION_SEC),
      0,
    );

    return {
      playlistId: p.id,
      name: p.name,
      trackCount: tracks.length,
      warmupCount: p.items.filter((i) => i.isWarmup).length,
      bachataCount,
      salsaCount,
      actualBachataPct: tracks.length
        ? Math.round((bachataCount / tracks.length) * 100)
        : 0,
      targetBachataPct: p.targetBachataPct,
      estimatedMinutes: Math.round(estSec / 60),
    };
  }
}
