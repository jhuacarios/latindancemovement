import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ImportResult,
  Paginated,
  Track,
  TrackSource,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';
import { parseTrackLink } from '../track-url.util';
import { toPublicTrack } from '../mappers';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackDto } from './dto/update-track.dto';
import { QueryTracksDto } from './dto/query-tracks.dto';

@Injectable()
export class TracksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Une hasta 3 sub-estilos en un CSV para guardar en la columna `substyle`. */
  private joinSubstyles(arr?: string[]): string | null {
    if (!arr || !arr.length) return null;
    const clean = arr.map((s) => s.trim()).filter(Boolean).slice(0, 3);
    return clean.length ? clean.join(', ') : null;
  }

  /** Crea una canción en el CATÁLOGO global (acción de admin). */
  async create(dto: CreateTrackDto, userId: string): Promise<Track> {
    const { source, sourceId } = this.resolveSource(dto);

    const existing = await this.prisma.track.findFirst({
      where: { source, sourceId, scope: 'CATALOG' },
    });
    if (existing) {
      throw new ConflictException(
        'Esa canción ya existe en el catálogo (mismo link/fuente).',
      );
    }

    const created = await this.prisma.track.create({
      data: {
        title: dto.title,
        artist: dto.artist,
        style: dto.style,
        substyle: this.joinSubstyles(dto.substyles),
        bpm: dto.bpm ?? null,
        year: dto.year ?? null,
        source,
        sourceId,
        coverUrl: dto.coverUrl ?? null,
        durationSec: dto.durationSec ?? null,
        isRelease: dto.isRelease ?? false,
        approvalStatus: dto.approvalStatus ?? 'APROBADA',
        scope: 'CATALOG',
        ownerId: null,
        artistUserId: dto.artistUserId ?? null,
        createdById: userId,
      },
    });
    return toPublicTrack(created);
  }

  /** Lista el CATÁLOGO global. Si se pasa userId, anota `inLibrary`. */
  async findAll(q: QueryTracksDto, userId?: string): Promise<Paginated<Track>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;

    const where: Prisma.TrackWhereInput = { scope: 'CATALOG' };
    if (q.style) where.style = q.style;
    if (q.substyle) where.substyle = { contains: q.substyle };
    if (q.source) where.source = q.source;
    if (q.approvalStatus) where.approvalStatus = q.approvalStatus;
    if (q.isRelease !== undefined) where.isRelease = q.isRelease;
    if (q.bpmMin !== undefined || q.bpmMax !== undefined) {
      where.bpm = {};
      if (q.bpmMin !== undefined) where.bpm.gte = q.bpmMin;
      if (q.bpmMax !== undefined) where.bpm.lte = q.bpmMax;
    }
    if (q.search) {
      where.OR = [
        { title: { contains: q.search } },
        { artist: { contains: q.search } },
      ];
    }

    const orderBy = this.buildOrderBy(q.sort);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.track.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.track.count({ where }),
    ]);

    const data = rows.map(toPublicTrack);
    if (userId && data.length) {
      const saved = await this.prisma.userTrack.findMany({
        where: { userId, trackId: { in: data.map((t) => t.id) } },
        select: { trackId: true },
      });
      const set = new Set(saved.map((s) => s.trackId));
      for (const t of data) t.inLibrary = set.has(t.id);
    }

    return { data, total, page, pageSize };
  }

  /** Crea o actualiza una canción del catálogo (por link/fuente). Devuelve id + si fue creada. */
  async upsertCatalog(
    dto: CreateTrackDto,
    userId: string,
  ): Promise<{ id: string; created: boolean }> {
    const { source, sourceId } = this.resolveSource(dto);
    const data = {
      title: dto.title,
      artist: dto.artist,
      style: dto.style,
      substyle: this.joinSubstyles(dto.substyles),
      bpm: dto.bpm ?? null,
      year: dto.year ?? null,
      coverUrl: dto.coverUrl ?? null,
      durationSec: dto.durationSec ?? null,
    };
    const existing = await this.prisma.track.findFirst({
      where: { source, sourceId, scope: 'CATALOG' },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.track.update({ where: { id: existing.id }, data });
      return { id: existing.id, created: false };
    }
    const created = await this.prisma.track.create({
      data: { ...data, source, sourceId, scope: 'CATALOG', createdById: userId },
    });
    return { id: created.id, created: true };
  }

  /** Catálogo es visible para todos; una canción PERSONAL solo para su dueño. */
  async findOne(id: string, userId?: string): Promise<Track> {
    const t = await this.prisma.track.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Canción no encontrada');
    if (t.scope === 'PERSONAL' && t.ownerId !== userId) {
      throw new NotFoundException('Canción no encontrada');
    }
    return toPublicTrack(t);
  }

  async update(id: string, dto: UpdateTrackDto): Promise<Track> {
    await this.ensureExists(id);

    const data: Prisma.TrackUpdateInput = {
      title: dto.title,
      artist: dto.artist,
      style: dto.style,
      substyle:
        dto.substyles !== undefined ? this.joinSubstyles(dto.substyles) : undefined,
      bpm: dto.bpm,
      year: dto.year,
      coverUrl: dto.coverUrl,
      durationSec: dto.durationSec,
      isRelease: dto.isRelease,
      approvalStatus: dto.approvalStatus,
    };

    // Si se cambia el link, re-resolvemos la fuente y evitamos duplicados.
    if (dto.link) {
      const parsed = parseTrackLink(dto.link);
      if (!parsed) {
        throw new BadRequestException(
          'No se pudo reconocer el link (esperado Spotify o YouTube).',
        );
      }
      const dup = await this.prisma.track.findFirst({
        where: {
          source: parsed.source,
          sourceId: parsed.sourceId,
          scope: 'CATALOG',
          NOT: { id },
        },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          'Ya existe otra canción en el catálogo con ese link.',
        );
      }
      data.source = parsed.source;
      data.sourceId = parsed.sourceId;
    }

    const updated = await this.prisma.track.update({ where: { id }, data });
    return toPublicTrack(updated);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.ensureExists(id);
    await this.prisma.track.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Carga masiva (upsert por source+sourceId). */
  async importMany(rows: CreateTrackDto[], userId: string): Promise<ImportResult> {
    const result: ImportResult = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const dto = rows[i];
      try {
        const { source, sourceId } = this.resolveSource(dto);
        const existing = await this.prisma.track.findFirst({
          where: { source, sourceId, scope: 'CATALOG' },
        });

        const data = {
          title: dto.title,
          artist: dto.artist,
          style: dto.style,
          substyle: this.joinSubstyles(dto.substyles),
          bpm: dto.bpm ?? null,
          year: dto.year ?? null,
          coverUrl: dto.coverUrl ?? null,
          durationSec: dto.durationSec ?? null,
          isRelease: dto.isRelease ?? false,
          approvalStatus: dto.approvalStatus ?? 'APROBADA',
          artistUserId: dto.artistUserId ?? null,
        };

        if (existing) {
          await this.prisma.track.update({ where: { id: existing.id }, data });
          result.updated++;
        } else {
          await this.prisma.track.create({
            data: { ...data, source, sourceId, createdById: userId },
          });
          result.created++;
        }
      } catch (e) {
        result.errors.push({
          index: i,
          reason: e instanceof Error ? e.message : 'error desconocido',
        });
      }
    }
    return result;
  }

  private buildOrderBy(
    sort: QueryTracksDto['sort'],
  ): Prisma.TrackOrderByWithRelationInput {
    switch (sort) {
      case 'title':
        return { title: 'asc' };
      case 'artist':
        return { artist: 'asc' };
      case 'bpm':
        return { bpm: 'asc' };
      case 'popularity':
        return { songRequests: { _count: 'desc' } };
      case 'recent':
      default:
        return { createdAt: 'desc' };
    }
  }

  resolveSource(dto: CreateTrackDto): {
    source: TrackSource;
    sourceId: string;
  } {
    if (dto.link) {
      const parsed = parseTrackLink(dto.link);
      if (!parsed) {
        throw new BadRequestException(
          'No se pudo reconocer el link (esperado Spotify o YouTube).',
        );
      }
      return parsed;
    }
    if (dto.source && dto.sourceId) {
      return { source: dto.source, sourceId: dto.sourceId };
    }
    throw new BadRequestException(
      'Entrega un `link`, o bien `source` + `sourceId`.',
    );
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.track.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Canción no encontrada');
  }
}
