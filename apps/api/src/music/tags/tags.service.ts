import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  DanceStyle,
  Tag,
  TagRef,
  TrackTagsResponse,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';

/** Normaliza un nombre de tag a un slug único (sin acentos/mayúsculas/puntuación). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async listVocabulary(): Promise<Tag[]> {
    const tags = await this.prisma.tag.findMany({
      include: { _count: { select: { tracks: true } } },
      orderBy: [{ style: 'asc' }, { name: 'asc' }],
    });
    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      style: (t.style as DanceStyle | null) ?? null,
      usageCount: t._count.tracks,
    }));
  }

  async create(name: string, style: DanceStyle | null, userId: string): Promise<Tag> {
    const slug = slugify(name);
    if (!slug) throw new BadRequestException('Nombre de tag inválido.');
    // Dedup por (slug, estilo): el mismo nombre puede existir en otro estilo.
    const existing = await this.prisma.tag.findFirst({
      where: { slug, style: style ?? null },
    });
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        style: (existing.style as DanceStyle | null) ?? null,
      };
    }
    const created = await this.prisma.tag.create({
      data: { name: name.trim(), slug, style: style ?? null, createdById: userId },
    });
    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      style: (created.style as DanceStyle | null) ?? null,
    };
  }

  async update(
    id: string,
    data: { name?: string; style?: DanceStyle | null },
  ): Promise<Tag> {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag no encontrado');

    const patch: { name?: string; slug?: string; style?: string | null } = {};

    // Estado final tras el cambio, para validar choque por (slug, estilo).
    const finalSlug = data.name !== undefined ? slugify(data.name) : tag.slug;
    if (data.name !== undefined && !finalSlug) {
      throw new BadRequestException('Nombre de tag inválido.');
    }
    const finalStyle = data.style !== undefined ? (data.style ?? null) : tag.style;

    if (data.name !== undefined || data.style !== undefined) {
      const clash = await this.prisma.tag.findFirst({
        where: { slug: finalSlug, style: finalStyle, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException('Ya existe ese sub-estilo en este estilo.');
      }
    }

    if (data.name !== undefined) {
      patch.name = data.name.trim();
      patch.slug = finalSlug;
    }
    if (data.style !== undefined) patch.style = data.style ?? null;

    const updated = await this.prisma.tag.update({ where: { id }, data: patch });
    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      style: (updated.style as DanceStyle | null) ?? null,
    };
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const tag = await this.prisma.tag.findUnique({ where: { id }, select: { id: true } });
    if (!tag) throw new NotFoundException('Tag no encontrado');
    await this.prisma.tag.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Tags del usuario + sugerencias (por uso) para una canción. */
  async getTrackTags(trackId: string, userId: string): Promise<TrackTagsResponse> {
    await this.assertTrackVisible(trackId, userId);

    const rows = await this.prisma.trackTag.findMany({
      where: { trackId },
      include: { tag: true },
    });

    const mine = rows.filter((r) => r.userId === userId).map((r) => r.tagId);

    const byTag = new Map<string, TrackTagSuggestionAcc>();
    for (const r of rows) {
      const acc = byTag.get(r.tagId);
      if (acc) acc.count++;
      else
        byTag.set(r.tagId, {
          id: r.tag.id,
          name: r.tag.name,
          style: (r.tag.style as DanceStyle | null) ?? null,
          count: 1,
        });
    }
    const suggestions = [...byTag.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );

    return { mine, suggestions };
  }

  /** Reemplaza las asociaciones del usuario para una canción. */
  async setTrackTags(
    trackId: string,
    userId: string,
    tagIds: string[],
  ): Promise<TrackTagsResponse> {
    await this.assertTrackVisible(trackId, userId);
    const unique = [...new Set(tagIds)];

    if (unique.length) {
      const found = await this.prisma.tag.count({ where: { id: { in: unique } } });
      if (found !== unique.length) {
        throw new BadRequestException('Algún tag no existe.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.trackTag.deleteMany({ where: { trackId, userId } }),
      ...unique.map((tagId) =>
        this.prisma.trackTag.create({ data: { trackId, userId, tagId } }),
      ),
    ]);

    return this.getTrackTags(trackId, userId);
  }

  /**
   * Siembra los tags PERSONALES del usuario para una canción a partir del
   * sub-estilo del CATÁLOGO, **solo si aún no tiene tags propios** (para no
   * pisar sus ediciones). Se usa al agregar una canción a Mis Canciones: hereda
   * los sub-estilos del catálogo, y desde ahí son del usuario.
   */
  async seedUserTagsFromTrack(trackId: string, userId: string): Promise<void> {
    const existing = await this.prisma.trackTag.count({
      where: { trackId, userId },
    });
    if (existing > 0) return;
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: { substyle: true, style: true },
    });
    if (!track?.substyle) return;
    const names = track.substyle
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const style = track.style as DanceStyle;
    for (const name of names) {
      const tag = await this.create(name, style, userId);
      await this.prisma.trackTag.upsert({
        where: { trackId_userId_tagId: { trackId, userId, tagId: tag.id } },
        create: { trackId, userId, tagId: tag.id },
        update: {},
      });
    }
  }

  /** Crea (o reutiliza) tags por nombre y los asocia al usuario en una canción. */
  async addTagsByName(
    trackId: string,
    userId: string,
    names: string[],
  ): Promise<void> {
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const tag = await this.create(name, null, userId);
      await this.prisma.trackTag.upsert({
        where: { trackId_userId_tagId: { trackId, userId, tagId: tag.id } },
        create: { trackId, userId, tagId: tag.id },
        update: {},
      });
    }
  }

  /** Mapa trackId -> tags del usuario (para listar Mis Canciones). */
  async tagsForTracks(
    userId: string,
    trackIds: string[],
  ): Promise<Map<string, TagRef[]>> {
    const map = new Map<string, TagRef[]>();
    if (!trackIds.length) return map;
    const rows = await this.prisma.trackTag.findMany({
      where: { userId, trackId: { in: trackIds } },
      include: { tag: true },
    });
    for (const r of rows) {
      const ref: TagRef = {
        id: r.tag.id,
        name: r.tag.name,
        style: (r.tag.style as DanceStyle | null) ?? null,
      };
      const list = map.get(r.trackId);
      if (list) list.push(ref);
      else map.set(r.trackId, [ref]);
    }
    return map;
  }

  private async assertTrackVisible(trackId: string, userId: string): Promise<void> {
    const t = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: { scope: true, ownerId: true },
    });
    if (!t) throw new NotFoundException('Canción no encontrada');
    if (t.scope === 'PERSONAL' && t.ownerId !== userId) {
      throw new NotFoundException('Canción no encontrada');
    }
  }
}

interface TrackTagSuggestionAcc {
  id: string;
  name: string;
  style: DanceStyle | null;
  count: number;
}
