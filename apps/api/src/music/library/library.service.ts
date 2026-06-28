import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DANCE_STYLES } from '@baile-latino/types';
import type {
  DanceStyle,
  ExtractedTrackMetadata,
  LibrarySummary,
  Paginated,
  PlaylistImportResult,
  Track,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';
import { toPublicTrack } from '../mappers';
import { TracksService } from '../tracks/tracks.service';
import { TagsService } from '../tags/tags.service';
import { CreateTrackDto } from '../tracks/dto/create-track.dto';
import { QueryTracksDto } from '../tracks/dto/query-tracks.dto';

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracks: TracksService,
    private readonly tags: TagsService,
  ) {}

  /** "Mis Canciones" = canciones de catálogo seleccionadas + canciones personales. */
  async listMine(userId: string, q: QueryTracksDto): Promise<Paginated<Track>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;

    const where: Prisma.TrackWhereInput = { savedBy: { some: { userId } } };
    if (q.style) where.style = q.style;
    if (q.source) where.source = q.source;

    const and: Prisma.TrackWhereInput[] = [];
    if (q.search) {
      and.push({
        OR: [
          { title: { contains: q.search } },
          { artist: { contains: q.search } },
        ],
      });
    }
    if (q.substyles?.length) {
      and.push({
        OR: q.substyles.map((s) => ({ substyle: { contains: s } })),
      });
    } else if (q.substyle) {
      where.substyle = { contains: q.substyle };
    }
    if (and.length) where.AND = and;

    const dir: Prisma.SortOrder = q.sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.TrackOrderByWithRelationInput =
      q.sortBy === 'title'
        ? { title: dir }
        : q.sortBy === 'artist'
          ? { artist: dir }
          : q.sortBy === 'year'
            ? { year: dir }
            : { createdAt: 'desc' };

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
    const tagMap = await this.tags.tagsForTracks(
      userId,
      data.map((t) => t.id),
    );
    for (const t of data) {
      t.inLibrary = true;
      t.tags = tagMap.get(t.id) ?? [];
    }
    return { data, total, page, pageSize };
  }

  /** Cuenta toda mi biblioteca por estilo (ignora filtros de la lista). */
  async summary(userId: string): Promise<LibrarySummary> {
    const base = { savedBy: { some: { userId } } } as const;
    const [bachata, salsa] = await this.prisma.$transaction([
      this.prisma.track.count({ where: { ...base, style: 'BACHATA' } }),
      this.prisma.track.count({ where: { ...base, style: 'SALSA' } }),
    ]);
    return { bachata, salsa, total: bachata + salsa };
  }

  /**
   * VideoIds de YouTube de mi biblioteca, separados por estilo. Solo fuente
   * YOUTUBE (las de Spotify no tienen video para una playlist de YouTube).
   */
  async myYoutubeVideoIdsByStyle(
    userId: string,
  ): Promise<{ bachata: string[]; salsa: string[] }> {
    const rows = await this.prisma.track.findMany({
      where: { savedBy: { some: { userId } }, source: 'YOUTUBE' },
      select: { sourceId: true, style: true },
    });
    const bachata: string[] = [];
    const salsa: string[] = [];
    for (const r of rows) {
      if (r.style === 'BACHATA') bachata.push(r.sourceId);
      else if (r.style === 'SALSA') salsa.push(r.sourceId);
    }
    return { bachata, salsa };
  }

  /** sourceIds de YouTube ya en mi biblioteca (para ignorar duplicados al cargar). */
  async myYoutubeSourceIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.track.findMany({
      where: { source: 'YOUTUBE', savedBy: { some: { userId } } },
      select: { sourceId: true },
    });
    return rows.map((r) => r.sourceId);
  }

  async myTrackIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userTrack.findMany({
      where: { userId },
      select: { trackId: true },
    });
    return rows.map((r) => r.trackId);
  }

  /** Agrega una canción del catálogo a mi biblioteca. */
  async addCatalog(userId: string, trackId: string): Promise<{ added: true }> {
    const track = await this.prisma.track.findFirst({
      where: { id: trackId, scope: 'CATALOG' },
      select: { id: true },
    });
    if (!track) throw new NotFoundException('Canción de catálogo no encontrada');
    await this.prisma.userTrack.upsert({
      where: { userId_trackId: { userId, trackId } },
      create: { userId, trackId },
      update: {},
    });
    return { added: true };
  }

  /** Agrega una canción PERSONAL (privada, no entra al catálogo) a mi biblioteca. */
  async addPersonal(userId: string, dto: CreateTrackDto): Promise<Track> {
    const { source, sourceId } = this.tracks.resolveSource(dto);

    let track = await this.prisma.track.findFirst({
      where: { ownerId: userId, scope: 'PERSONAL', source, sourceId },
    });
    if (!track) {
      track = await this.prisma.track.create({
        data: {
          title: dto.title,
          artist: dto.artist,
          style: dto.style,
          substyle:
            dto.substyles && dto.substyles.length
              ? dto.substyles.map((s) => s.trim()).filter(Boolean).slice(0, 4).join(', ')
              : null,
          year: dto.year ?? null,
          source,
          sourceId,
          coverUrl: dto.coverUrl ?? null,
          durationSec: dto.durationSec ?? null,
          ytMetadata: dto.ytMetadata ?? null,
          scope: 'PERSONAL',
          ownerId: userId,
          createdById: userId,
        },
      });
    }
    await this.prisma.userTrack.upsert({
      where: { userId_trackId: { userId, trackId: track.id } },
      create: { userId, trackId: track.id },
      update: {},
    });
    return toPublicTrack(track);
  }

  /**
   * Importa a MI biblioteca todas las canciones de una playlist de YouTube,
   * como canciones PERSONALES (privadas). Deduplica: si ya tengo esa canción
   * en mi biblioteca (de catálogo o personal), la salta.
   */
  async importPlaylistItems(
    items: ExtractedTrackMetadata[],
    defaultStyle: DanceStyle | undefined,
    userId: string,
    overrides?: Record<string, DanceStyle>,
  ): Promise<PlaylistImportResult> {
    let created = 0;
    let updated = 0; // ya estaban en mi biblioteca
    const errors: string[] = [];

    for (const it of items) {
      try {
        const override = overrides?.[it.sourceId];
        const style: DanceStyle | undefined =
          override && DANCE_STYLES.includes(override)
            ? override
            : (it.detectedStyle ?? defaultStyle ?? undefined);

        // ¿ya la tengo en mi biblioteca (catálogo o personal)?
        const inLib = await this.prisma.track.findFirst({
          where: {
            source: 'YOUTUBE',
            sourceId: it.sourceId,
            savedBy: { some: { userId } },
          },
          select: { id: true },
        });
        if (inLib) {
          updated++;
          continue;
        }

        // Sin estilo (no detectado y el usuario no eligió): se omite.
        if (!style) {
          errors.push(`${it.title}: sin estilo, no importada`);
          continue;
        }

        // Reusa mi canción personal si ya la creé antes; si no, créala.
        let track = await this.prisma.track.findFirst({
          where: {
            ownerId: userId,
            scope: 'PERSONAL',
            source: 'YOUTUBE',
            sourceId: it.sourceId,
          },
          select: { id: true },
        });
        if (!track) {
          track = await this.prisma.track.create({
            data: {
              title: it.title,
              artist: it.artist ?? it.channelTitle ?? 'Desconocido',
              style,
              source: 'YOUTUBE',
              sourceId: it.sourceId,
              year: it.year ?? null,
              coverUrl: it.coverUrl ?? null,
              durationSec: it.durationSec ?? null,
              ytMetadata: it.details ? JSON.stringify(it.details) : null,
              scope: 'PERSONAL',
              ownerId: userId,
              createdById: userId,
            },
            select: { id: true },
          });
        }
        await this.prisma.userTrack.upsert({
          where: { userId_trackId: { userId, trackId: track.id } },
          create: { userId, trackId: track.id },
          update: {},
        });
        created++;
      } catch (e) {
        errors.push(`${it.title}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }

    return { total: items.length, created, updated, errors };
  }

  /**
   * Quita una canción de mi biblioteca. Si es PERSONAL y mía, se elimina
   * por completo (es privada). Si es de catálogo, solo se desvincula.
   */
  async remove(userId: string, trackId: string): Promise<{ removed: true }> {
    await this.prisma.userTrack.deleteMany({ where: { userId, trackId } });
    const track = await this.prisma.track.findUnique({ where: { id: trackId } });
    if (track && track.scope === 'PERSONAL' && track.ownerId === userId) {
      await this.prisma.track.delete({ where: { id: trackId } });
    }
    return { removed: true };
  }
}
