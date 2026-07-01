import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DANCE_STYLES } from '@baile-latino/types';
import type {
  DanceStyle,
  DuplicateGroup,
  ExtractedTrackMetadata,
  ImportResult,
  Paginated,
  PlaylistImportResult,
  Track,
  TrackSource,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';
import { parseTrackLink } from '../track-url.util';
import { normalizeSearch } from '../search.util';
import { toPublicTrack } from '../mappers';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackDto } from './dto/update-track.dto';
import { QueryTracksDto } from './dto/query-tracks.dto';

/** Adornos típicos a ignorar al detectar duplicados (incluye "en vivo", "demo"). */
const DUP_NOISE =
  /\b(official|oficial|video|videoclip|audio|lyric|lyrics|letra|hd|hq|4k|8k|mv|en\s*vivo|live|directo|concierto|remaster\w*|remasterizad\w*|version|cover|demo|visualizer|extended|radio\s*edit)\b/g;

/** Normaliza título/artista para comparar duplicados (sin acentos, adornos, etc.). */
function normForDup(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // (...) [...]
    .replace(DUP_NOISE, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ') // artistas invitados
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

@Injectable()
export class TracksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Construye un patch que SOLO rellena campos vacíos de una canción existente;
   * nunca pisa valores ya presentes (protege la curación manual). title y style
   * no se incluyen porque una canción existente siempre los tiene.
   */
  private fillEmptyPatch(
    existing: {
      year: number | null;
      coverUrl: string | null;
      durationSec: number | null;
      ytMetadata: string | null;
      substyle: string | null;
      artist: string | null;
    },
    dto: CreateTrackDto,
  ): Prisma.TrackUpdateInput {
    const patch: Prisma.TrackUpdateInput = {};
    if (existing.year == null && dto.year != null) patch.year = dto.year;
    if (existing.coverUrl == null && dto.coverUrl != null) patch.coverUrl = dto.coverUrl;
    if (existing.durationSec == null && dto.durationSec != null)
      patch.durationSec = dto.durationSec;
    if (existing.ytMetadata == null && dto.ytMetadata != null) {
      patch.ytMetadata = dto.ytMetadata;
      patch.viewCount = this.viewsFromMeta(dto.ytMetadata);
    }
    const sub = this.joinSubstyles(dto.substyles);
    if (!existing.substyle && sub) patch.substyle = sub;
    if (!existing.artist && dto.artist) patch.artist = dto.artist;
    return patch;
  }

  /**
   * Extrae las reproducciones (viewCount) del JSON de metadata de YouTube como
   * BigInt, para poder ordenar por ese campo. Devuelve null si no hay dato.
   */
  private viewsFromMeta(json: string | null | undefined): bigint | null {
    if (!json) return null;
    try {
      const meta = JSON.parse(json) as { viewCount?: unknown };
      const v = meta?.viewCount;
      if (v == null) return null;
      const s = String(v).trim();
      return /^\d+$/.test(s) ? BigInt(s) : null;
    } catch {
      return null;
    }
  }

  /** Une hasta 3 sub-estilos en un CSV para guardar en la columna `substyle`. */
  private joinSubstyles(arr?: string[]): string | null {
    if (!arr || !arr.length) return null;
    const clean = arr.map((s) => s.trim()).filter(Boolean).slice(0, 4);
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
        ytMetadata: dto.ytMetadata ?? null,
        viewCount: this.viewsFromMeta(dto.ytMetadata),
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
    if (q.substyle)
      where.substyle = { contains: q.substyle, mode: 'insensitive' };
    if (q.source) where.source = q.source;
    // Excluye lo que ya tengo en Mi biblioteca (para el modo "Catálogo").
    if (q.excludeMine && userId) where.savedBy = { none: { userId } };
    if (q.approvalStatus) where.approvalStatus = q.approvalStatus;
    if (q.isRelease !== undefined) where.isRelease = q.isRelease;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { artist: { contains: q.search, mode: 'insensitive' } },
        // Match sin acentos (columna normalizada por trigger).
        { searchText: { contains: normalizeSearch(q.search) } },
      ];
    }

    const orderBy = this.buildOrderBy(q);

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

  /**
   * Busca canciones por sus videoIds de YouTube: las del catálogo global y las
   * personales del propio usuario. Devuelve un mapa videoId → Track (con
   * `inLibrary` resuelto). Para enriquecer vistas externas (ej: playlists de
   * YouTube) con nuestra data. La personal del usuario tiene prioridad.
   */
  async findByYoutubeIds(
    videoIds: string[],
    userId?: string,
  ): Promise<Map<string, Track>> {
    const ids = [...new Set(videoIds.filter(Boolean))];
    if (!ids.length) return new Map();

    const scopeFilter: Prisma.TrackWhereInput[] = [{ scope: 'CATALOG' }];
    if (userId) scopeFilter.push({ scope: 'PERSONAL', ownerId: userId });

    const rows = await this.prisma.track.findMany({
      where: { source: 'YOUTUBE', sourceId: { in: ids }, OR: scopeFilter },
    });
    const tracks = rows.map(toPublicTrack);

    // inLibrary: las personales propias siempre cuentan; las del catálogo, si
    // están en UserTrack del usuario.
    if (userId && tracks.length) {
      const saved = await this.prisma.userTrack.findMany({
        where: { userId, trackId: { in: tracks.map((t) => t.id) } },
        select: { trackId: true },
      });
      const set = new Set(saved.map((s) => s.trackId));
      for (const t of tracks) {
        t.inLibrary = t.scope === 'PERSONAL' ? t.ownerId === userId : set.has(t.id);
      }
    }

    // Si hay catálogo y personal con el mismo videoId, prioriza la personal.
    const map = new Map<string, Track>();
    for (const t of tracks) {
      const prev = map.get(t.sourceId);
      if (!prev || t.scope === 'PERSONAL') map.set(t.sourceId, t);
    }
    return map;
  }

  /** Igual que findByYoutubeIds pero para tracks de Spotify (por sourceId). */
  async findBySpotifyIds(
    spotifyIds: string[],
    userId?: string,
  ): Promise<Map<string, Track>> {
    const ids = [...new Set(spotifyIds.filter(Boolean))];
    if (!ids.length) return new Map();

    const scopeFilter: Prisma.TrackWhereInput[] = [{ scope: 'CATALOG' }];
    if (userId) scopeFilter.push({ scope: 'PERSONAL', ownerId: userId });

    const rows = await this.prisma.track.findMany({
      where: { source: 'SPOTIFY', sourceId: { in: ids }, OR: scopeFilter },
    });
    const tracks = rows.map(toPublicTrack);

    if (userId && tracks.length) {
      const saved = await this.prisma.userTrack.findMany({
        where: { userId, trackId: { in: tracks.map((t) => t.id) } },
        select: { trackId: true },
      });
      const set = new Set(saved.map((s) => s.trackId));
      for (const t of tracks) {
        t.inLibrary =
          t.scope === 'PERSONAL' ? t.ownerId === userId : set.has(t.id);
      }
    }

    const map = new Map<string, Track>();
    for (const t of tracks) {
      const prev = map.get(t.sourceId);
      if (!prev || t.scope === 'PERSONAL') map.set(t.sourceId, t);
    }
    return map;
  }

  /**
   * Crea una canción del catálogo si no existe. Si ya existe (por fuente),
   * NO pisa lo que ya tiene valor: solo rellena los campos vacíos. Así una
   * re-importación nunca borra ni sobreescribe la curación manual (estilo,
   * sub-estilos…). Devuelve id + si fue creada.
   */
  async upsertCatalog(
    dto: CreateTrackDto,
    userId: string,
    opts?: { fillEmptyOnly?: boolean },
  ): Promise<{ id: string; created: boolean }> {
    const { source, sourceId } = this.resolveSource(dto);
    const existing = await this.prisma.track.findFirst({
      where: { source, sourceId, scope: 'CATALOG' },
    });

    if (existing) {
      const patch: Prisma.TrackUpdateInput = opts?.fillEmptyOnly
        ? this.fillEmptyPatch(existing, dto)
        : {
            // Sobreescritura completa (importación deliberada, ej. Excel).
            title: dto.title,
            artist: dto.artist,
            style: dto.style,
            substyle: this.joinSubstyles(dto.substyles),
            year: dto.year ?? null,
            coverUrl: dto.coverUrl ?? null,
            durationSec: dto.durationSec ?? null,
            ytMetadata: dto.ytMetadata ?? null,
            viewCount: this.viewsFromMeta(dto.ytMetadata),
          };

      if (Object.keys(patch).length) {
        await this.prisma.track.update({ where: { id: existing.id }, data: patch });
      }
      return { id: existing.id, created: false };
    }

    const created = await this.prisma.track.create({
      data: {
        title: dto.title,
        artist: dto.artist,
        style: dto.style,
        substyle: this.joinSubstyles(dto.substyles),
        year: dto.year ?? null,
        coverUrl: dto.coverUrl ?? null,
        durationSec: dto.durationSec ?? null,
        ytMetadata: dto.ytMetadata ?? null,
        viewCount: this.viewsFromMeta(dto.ytMetadata),
        source,
        sourceId,
        scope: 'CATALOG',
        createdById: userId,
      },
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
      year: dto.year,
      coverUrl: dto.coverUrl,
      durationSec: dto.durationSec,
      isRelease: dto.isRelease,
      approvalStatus: dto.approvalStatus,
      ytMetadata: dto.ytMetadata,
      viewCount:
        dto.ytMetadata !== undefined
          ? this.viewsFromMeta(dto.ytMetadata)
          : undefined,
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

  /**
   * Marca una canción como no-embebible (embeddable=false en su ytMetadata).
   * Se usa cuando el reproductor detecta que YouTube bloquea el embed.
   */
  async markNotEmbeddable(id: string): Promise<{ ok: true }> {
    const track = await this.prisma.track.findUnique({
      where: { id },
      select: { ytMetadata: true },
    });
    if (!track) throw new NotFoundException('Canción no encontrada');

    let meta: Record<string, unknown> = {};
    if (track.ytMetadata) {
      try {
        meta = JSON.parse(track.ytMetadata) as Record<string, unknown>;
      } catch {
        meta = {};
      }
    }
    meta.embeddable = false;
    await this.prisma.track.update({
      where: { id },
      data: { ytMetadata: JSON.stringify(meta) },
    });
    return { ok: true };
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

  /** Guarda en el catálogo las canciones extraídas de una playlist de YouTube. */
  /** sourceIds de YouTube ya presentes en el catálogo. */
  async catalogYoutubeSourceIds(): Promise<string[]> {
    const rows = await this.prisma.track.findMany({
      where: { source: 'YOUTUBE', scope: 'CATALOG' },
      select: { sourceId: true },
    });
    return rows.map((r) => r.sourceId);
  }

  /**
   * Rellena el estilo (detectedStyle) de canciones que no lo tienen, cruzándolas
   * con el CATÁLOGO por artista+título normalizado (tu curación es la fuente más
   * fiable, mejor que los géneros de Spotify que suelen venir vacíos). Muta los
   * items y devuelve cuántos rellenó.
   */
  async fillStylesFromCatalog(
    items: {
      title: string;
      artist?: string | null;
      detectedStyle?: DanceStyle | null;
    }[],
  ): Promise<number> {
    if (!items.some((i) => !i.detectedStyle)) return 0;
    const firstArtist = (a: string | null | undefined) =>
      (a ?? '').split(/[,&]|\bfeat\b|\bft\b/i)[0];
    const rows = await this.prisma.track.findMany({
      where: { scope: 'CATALOG' },
      select: { title: true, artist: true, style: true },
    });
    const byArtistTitle = new Map<string, DanceStyle>();
    const byTitle = new Map<string, Set<DanceStyle>>();
    for (const r of rows) {
      const t = normForDup(r.title);
      if (!t) continue;
      const ak = `${normForDup(firstArtist(r.artist))}|${t}`;
      if (!byArtistTitle.has(ak)) byArtistTitle.set(ak, r.style as DanceStyle);
      const set = byTitle.get(t) ?? new Set<DanceStyle>();
      set.add(r.style as DanceStyle);
      byTitle.set(t, set);
    }
    let filled = 0;
    for (const it of items) {
      if (it.detectedStyle) continue;
      const t = normForDup(it.title);
      if (!t) continue;
      const ak = `${normForDup(firstArtist(it.artist))}|${t}`;
      let s = byArtistTitle.get(ak);
      // Fallback por título solo si en el catálogo ese título es de un único estilo.
      if (!s) {
        const set = byTitle.get(t);
        if (set && set.size === 1) s = [...set][0];
      }
      if (s) {
        it.detectedStyle = s;
        filled++;
      }
    }
    return filled;
  }

  /** sourceIds de Spotify ya en el catálogo (para ignorar al importar). */
  async catalogSpotifySourceIds(): Promise<string[]> {
    const rows = await this.prisma.track.findMany({
      where: { source: 'SPOTIFY', scope: 'CATALOG' },
      select: { sourceId: true },
    });
    return rows.map((r) => r.sourceId);
  }

  /**
   * Importa al catálogo (como tracks SPOTIFY) las canciones ya resueltas de una
   * playlist de Spotify. El estilo sale de lo detectado o del override elegido;
   * las que queden sin estilo se omiten. No pisa la curación de las existentes.
   */
  async importSpotifyToCatalog(
    items: {
      sourceId: string;
      title: string;
      artist?: string | null;
      durationSec?: number | null;
      year?: number | null;
      coverUrl?: string | null;
      detectedStyle?: DanceStyle | null;
    }[],
    overrides: Record<string, DanceStyle> | undefined,
    userId: string,
  ): Promise<PlaylistImportResult> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const it of items) {
      try {
        const override = overrides?.[it.sourceId];
        const style: DanceStyle | undefined =
          override && DANCE_STYLES.includes(override)
            ? override
            : (it.detectedStyle ?? undefined);
        if (!style) {
          errors.push(`${it.title}: sin estilo, no importada`);
          continue;
        }
        const res = await this.upsertCatalog(
          {
            title: it.title,
            artist: it.artist ?? 'Desconocido',
            style,
            source: 'SPOTIFY',
            sourceId: it.sourceId,
            year: it.year ?? undefined,
            coverUrl: it.coverUrl ?? undefined,
            durationSec: it.durationSec ?? undefined,
          },
          userId,
          { fillEmptyOnly: true },
        );
        if (res.created) created++;
        else updated++;
      } catch (e) {
        errors.push(`${it.title}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }
    return { total: items.length, created, updated, errors };
  }

  /** Canciones de catálogo (YouTube) que no tienen duración guardada. */
  async catalogMissingDuration(): Promise<{ id: string; sourceId: string }[]> {
    return this.prisma.track.findMany({
      where: { scope: 'CATALOG', source: 'YOUTUBE', durationSec: null },
      select: { id: true, sourceId: true },
    });
  }

  /**
   * Rellena `viewCount` (desde ytMetadata) en las canciones del catálogo que aún
   * no lo tienen. Idempotente; sirve para ponerse al día con datos ya guardados.
   */
  async backfillViewCounts(): Promise<{ updated: number }> {
    const rows = await this.prisma.track.findMany({
      where: { scope: 'CATALOG', viewCount: null, ytMetadata: { not: null } },
      select: { id: true, ytMetadata: true },
    });
    let updated = 0;
    for (const r of rows) {
      const v = this.viewsFromMeta(r.ytMetadata);
      if (v != null) {
        await this.prisma.track.update({
          where: { id: r.id },
          data: { viewCount: v },
        });
        updated++;
      }
    }
    return { updated };
  }

  /** Aplica duraciones (en segundos) por id de track. */
  async setDurations(
    updates: { id: string; durationSec: number }[],
  ): Promise<number> {
    let n = 0;
    for (const u of updates) {
      await this.prisma.track.update({
        where: { id: u.id },
        data: { durationSec: u.durationSec },
      });
      n++;
    }
    return n;
  }

  /**
   * Agrupa canciones del catálogo que parecen la misma (mismo título+artista
   * normalizado, ignorando adornos como "official video", "en vivo", "demo",
   * etc.). Devuelve solo los grupos con 2+ candidatas, para que el admin elija
   * cuál conservar.
   */
  async findDuplicateGroups(): Promise<DuplicateGroup[]> {
    const rows = await this.prisma.track.findMany({
      where: { scope: 'CATALOG' },
      orderBy: { createdAt: 'asc' },
    });
    const groups = new Map<string, typeof rows>();
    for (const t of rows) {
      const titleKey = normForDup(t.title);
      if (!titleKey) continue; // título sin contenido tras limpiar
      const key = `${normForDup(t.artist)}|${titleKey}`;
      const arr = groups.get(key);
      if (arr) arr.push(t);
      else groups.set(key, [t]);
    }
    return [...groups.entries()]
      .filter(([, g]) => g.length > 1)
      .map(([key, g]) => ({ key, tracks: g.map(toPublicTrack) }));
  }

  /**
   * Conserva `keepId` y elimina `removeIds`, **reasignando** sus referencias
   * (bibliotecas y playlists) a la que se queda, para no perder la canción de
   * ningún lado. El resto (tags, solicitudes) se borra en cascada.
   */
  async mergeDuplicates(
    keepId: string,
    removeIds: string[],
  ): Promise<{ kept: string; removed: number }> {
    await this.ensureExists(keepId);
    const ids = removeIds.filter((r) => r && r !== keepId);
    for (const rid of ids) {
      await this.prisma.$transaction(async (tx) => {
        // Playlists: mover a keep, evitando duplicar en la misma playlist.
        const items = await tx.playlistItem.findMany({
          where: { trackId: rid },
          select: { id: true, playlistId: true },
        });
        for (const it of items) {
          const exists = await tx.playlistItem.findFirst({
            where: { playlistId: it.playlistId, trackId: keepId },
            select: { id: true },
          });
          if (exists) await tx.playlistItem.delete({ where: { id: it.id } });
          else
            await tx.playlistItem.update({
              where: { id: it.id },
              data: { trackId: keepId },
            });
        }
        // Bibliotecas (Mis Canciones): igual.
        const uts = await tx.userTrack.findMany({
          where: { trackId: rid },
          select: { userId: true },
        });
        for (const ut of uts) {
          const exists = await tx.userTrack.findUnique({
            where: { userId_trackId: { userId: ut.userId, trackId: keepId } },
            select: { userId: true },
          });
          if (exists)
            await tx.userTrack.deleteMany({
              where: { userId: ut.userId, trackId: rid },
            });
          else
            await tx.userTrack.updateMany({
              where: { userId: ut.userId, trackId: rid },
              data: { trackId: keepId },
            });
        }
        await tx.track.delete({ where: { id: rid } });
      });
    }
    return { kept: keepId, removed: ids.length };
  }

  async importPlaylistItems(
    items: ExtractedTrackMetadata[],
    defaultStyle: DanceStyle | undefined,
    userId: string,
    overrides?: Record<string, DanceStyle>,
  ): Promise<PlaylistImportResult> {
    let created = 0;
    let updated = 0; // ya estaban en el catálogo (se omiten)
    const errors: string[] = [];

    for (const it of items) {
      try {
        // ¿ya está en el catálogo? -> se omite (no se toca).
        const existing = await this.prisma.track.findFirst({
          where: { source: 'YOUTUBE', sourceId: it.sourceId, scope: 'CATALOG' },
          select: { id: true },
        });
        if (existing) {
          updated++;
          continue;
        }

        const override = overrides?.[it.sourceId];
        const style: DanceStyle | undefined =
          override && DANCE_STYLES.includes(override)
            ? override
            : (it.detectedStyle ?? defaultStyle ?? undefined);
        // Sin estilo (no detectado y el usuario no eligió): se omite.
        if (!style) {
          errors.push(`${it.title}: sin estilo, no importada`);
          continue;
        }
        const res = await this.upsertCatalog(
          {
            title: it.title,
            artist: it.artist ?? it.channelTitle ?? 'Desconocido',
            style,
            source: 'YOUTUBE',
            sourceId: it.sourceId,
            year: it.year ?? undefined,
            coverUrl: it.coverUrl ?? undefined,
            durationSec: it.durationSec ?? undefined,
            ytMetadata: JSON.stringify(it.details),
          },
          userId,
          { fillEmptyOnly: true },
        );
        if (res.created) created++;
        else updated++;
      } catch (e) {
        errors.push(
          `${it.title}: ${e instanceof Error ? e.message : 'error'}`,
        );
      }
    }

    return { total: items.length, created, updated, errors };
  }

  private buildOrderBy(q: QueryTracksDto): Prisma.TrackOrderByWithRelationInput {
    // Ordenamiento por columna (click en el header).
    if (q.sortBy) {
      const dir: Prisma.SortOrder = q.sortDir === 'desc' ? 'desc' : 'asc';
      switch (q.sortBy) {
        case 'title':
          return { title: dir };
        case 'artist':
          return { artist: dir };
        case 'year':
          return { year: dir };
        case 'createdAt':
          return { createdAt: dir };
        case 'views':
          // Las que no tienen dato de reproducciones van siempre al final.
          return { viewCount: { sort: dir, nulls: 'last' } };
      }
    }
    switch (q.sort) {
      case 'title':
        return { title: 'asc' };
      case 'artist':
        return { artist: 'asc' };
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
