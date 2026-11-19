import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ACADEMY_PHOTO_MAX_BYTES,
  type AcademyMediaLocation,
  type PlaceMediaDto,
  type PlaceMediaListDto,
  type PlaceMediaStorage,
  type PlaceMediaUploadTicket,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import { MediaStorageService } from '../media/media-storage.service';
import { DUPLICATE_PREFIX, EXT, THUMB_MIME, downloadName, kindOf, ymdToDate } from '../media/media-files';
import type { AuthUser } from '../auth/auth.types';

const MB = 1024 * 1024;
/** Una subida no confirmada en 24 h se da por abandonada (no cuenta y se borra). */
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;
/** Por ahora solo los sociales al aire libre tienen espacio de fotos y videos. */
const KINDS_WITH_MEDIA = ['OUTDOOR_SOCIAL'];

const SELECT = {
  id: true,
  placeId: true,
  title: true,
  description: true,
  recordedOn: true,
  storageKey: true,
  thumbKey: true,
  mimeType: true,
  sizeBytes: true,
  durationMs: true,
  status: true,
  location: true,
  createdAt: true,
  uploadedBy: { select: { name: true, displayName: true } },
} satisfies Prisma.PlaceMediaSelect;

type Row = Prisma.PlaceMediaGetPayload<{ select: typeof SELECT }>;

const staleCutoff = () => new Date(Date.now() - STALE_UPLOAD_MS);
/** Lo que ocupa cupo: lo listo, o lo que se está subiendo hace menos de 24 h. */
const countsForQuota = () => ({
  OR: [{ status: 'READY' }, { status: 'UPLOADING', createdAt: { gte: staleCutoff() } }],
});

/**
 * Fotos y videos de un social (versión gratis: 5 GB de galería + 20 GB de bóveda).
 * Sube, borra y mueve a la bóveda el administrador del lugar (o el SUPER_ADMIN);
 * ven y descargan los miembros de la comunidad. El navegador sube directo al
 * bucket privado de media con una URL firmada; acá solo se registra y se valida.
 */
@Injectable()
export class PlaceMediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaceMediaService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaStorageService,
  ) {}

  // --- limpieza de subidas abandonadas (al arrancar y cada 6 h) ----------------
  onModuleInit(): void {
    this.timer = setTimeout(() => {
      void this.cleanStale();
      this.timer = setInterval(() => void this.cleanStale(), CLEANUP_EVERY_MS);
      this.timer.unref?.();
    }, 90_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private async cleanStale(placeId?: string): Promise<void> {
    try {
      const stale = await this.prisma.placeMedia.findMany({
        where: { status: 'UPLOADING', createdAt: { lt: staleCutoff() }, ...(placeId ? { placeId } : {}) },
        select: { id: true, storageKey: true, thumbKey: true },
      });
      for (const m of stale) await this.removeRow(m);
      if (stale.length && !placeId) this.logger.log(`Subidas abandonadas de sociales borradas: ${stale.length}`);
    } catch (e) {
      this.logger.warn(`No se pudieron limpiar las subidas abandonadas: ${(e as Error).message}`);
    }
  }

  private async removeRow(m: { id: string; storageKey: string; thumbKey: string | null }): Promise<void> {
    await this.prisma.placeMedia.delete({ where: { id: m.id } });
    await this.media.remove(m.storageKey);
    if (m.thumbKey) await this.media.remove(m.thumbKey);
  }

  // --- permisos -------------------------------------------------------------------
  private async place(placeId: string) {
    const p = await this.prisma.communityPlace.findUnique({
      where: { id: placeId },
      select: { id: true, kind: true, adminId: true, mediaQuotaMb: true, vaultQuotaMb: true },
    });
    if (!p) throw new NotFoundException('Lugar no encontrado.');
    if (!KINDS_WITH_MEDIA.includes(p.kind)) {
      throw new BadRequestException('Este lugar no tiene espacio de fotos y videos.');
    }
    return p;
  }

  private canManage(user: AuthUser, p: { adminId: string | null }): boolean {
    return user.role === 'SUPER_ADMIN' || p.adminId === user.id;
  }

  /** Para ver: miembro de la comunidad (o quien administra). */
  private async assertViewer(user: AuthUser, placeId: string) {
    const p = await this.place(placeId);
    if (this.canManage(user, p)) return p;
    const member = await this.prisma.communityMember.findUnique({
      where: { placeId_userId: { placeId, userId: user.id } },
      select: { userId: true },
    });
    if (!member) throw new ForbiddenException('Únete a la comunidad para ver sus fotos y videos.');
    return p;
  }

  private async assertManager(user: AuthUser, placeId: string) {
    const p = await this.place(placeId);
    if (!this.canManage(user, p)) {
      throw new ForbiddenException('Solo el administrador del social sube y gestiona sus fotos y videos.');
    }
    return p;
  }

  private async row(placeId: string, mediaId: string): Promise<Row> {
    const m = await this.prisma.placeMedia.findFirst({ where: { id: mediaId, placeId }, select: SELECT });
    if (!m) throw new NotFoundException('Archivo no encontrado.');
    return m;
  }

  // --- cupos ----------------------------------------------------------------------
  private async used(placeId: string, location: AcademyMediaLocation): Promise<number> {
    const agg = await this.prisma.placeMedia.aggregate({
      where: { placeId, location, ...countsForQuota() },
      _sum: { sizeBytes: true },
    });
    return Number(agg._sum.sizeBytes ?? 0);
  }

  private async storage(p: { id: string; mediaQuotaMb: number; vaultQuotaMb: number }): Promise<PlaceMediaStorage> {
    const [usedBytes, vaultUsedBytes] = await Promise.all([this.used(p.id, 'GALLERY'), this.used(p.id, 'VAULT')]);
    return {
      usedBytes,
      quotaBytes: p.mediaQuotaMb * MB,
      vaultUsedBytes,
      vaultQuotaBytes: p.vaultQuotaMb * MB,
    };
  }

  private async toDto(m: Row): Promise<PlaceMediaDto> {
    return {
      id: m.id,
      placeId: m.placeId,
      kind: kindOf(m.mimeType),
      location: m.location as AcademyMediaLocation,
      title: m.title,
      description: m.description,
      recordedOn: m.recordedOn ? m.recordedOn.toISOString().slice(0, 10) : null,
      mimeType: m.mimeType,
      sizeBytes: Number(m.sizeBytes),
      durationMs: m.durationMs,
      thumbUrl: m.thumbKey && m.status === 'READY' ? await this.media.viewUrl(m.thumbKey).catch(() => null) : null,
      uploadedByName: m.uploadedBy.displayName?.trim() || m.uploadedBy.name,
      createdAt: m.createdAt.toISOString(),
    };
  }

  // --- lectura --------------------------------------------------------------------
  async list(user: AuthUser, placeId: string): Promise<PlaceMediaListDto> {
    const p = await this.assertViewer(user, placeId);
    const manage = this.canManage(user, p);
    const rows = await this.prisma.placeMedia.findMany({
      where: { placeId, status: 'READY', location: 'GALLERY' },
      select: SELECT,
      orderBy: [{ recordedOn: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return {
      items: await Promise.all(rows.map((r) => this.toDto(r))),
      canManage: manage,
      storage: manage ? await this.storage(p) : null,
    };
  }

  async listVault(user: AuthUser, placeId: string): Promise<PlaceMediaDto[]> {
    await this.assertManager(user, placeId);
    const rows = await this.prisma.placeMedia.findMany({
      where: { placeId, status: 'READY', location: 'VAULT' },
      select: SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async viewUrl(user: AuthUser, placeId: string, mediaId: string): Promise<{ url: string }> {
    await this.assertViewer(user, placeId);
    const m = await this.row(placeId, mediaId);
    if (m.status !== 'READY') throw new ConflictException('El archivo todavía se está subiendo.');
    if (m.location === 'VAULT') {
      throw new ConflictException('Este archivo está en la bóveda: no se reproduce, solo se descarga.');
    }
    return { url: await this.media.viewUrl(m.storageKey) };
  }

  async downloadUrl(user: AuthUser, placeId: string, mediaId: string): Promise<{ url: string }> {
    const p = await this.assertViewer(user, placeId);
    const m = await this.row(placeId, mediaId);
    if (m.status !== 'READY') throw new ConflictException('El archivo todavía se está subiendo.');
    // Lo de la bóveda solo lo baja quien administra (descargar de ahí tiene costo).
    if (m.location === 'VAULT' && !this.canManage(user, p)) throw new NotFoundException('Archivo no encontrado.');
    return { url: await this.media.downloadUrl(m.storageKey, downloadName(m)) };
  }

  // --- subida ---------------------------------------------------------------------
  async duplicates(
    user: AuthUser,
    placeId: string,
    hashes: string[],
  ): Promise<{ hash: string; mediaId: string; title: string; location: AcademyMediaLocation }[]> {
    await this.assertManager(user, placeId);
    if (hashes.length === 0) return [];
    const rows = await this.prisma.placeMedia.findMany({
      where: { placeId, status: 'READY', contentHash: { in: hashes } },
      select: { id: true, title: true, contentHash: true, location: true },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => r.contentHash && !seen.has(r.contentHash) && seen.add(r.contentHash))
      .map((r) => ({
        hash: r.contentHash!,
        mediaId: r.id,
        title: r.title,
        location: r.location as AcademyMediaLocation,
      }));
  }

  async createUpload(
    user: AuthUser,
    placeId: string,
    dto: {
      title: string;
      mimeType: string;
      sizeBytes: number;
      recordedOn?: string | null;
      description?: string | null;
      contentHash?: string;
    },
  ): Promise<PlaceMediaUploadTicket> {
    const p = await this.assertManager(user, placeId);
    this.media.assertEnabled();
    if (kindOf(dto.mimeType) === 'PHOTO' && dto.sizeBytes > ACADEMY_PHOTO_MAX_BYTES) {
      throw new BadRequestException('La foto no puede superar 25 MB.');
    }
    await this.cleanStale(placeId);
    if (dto.contentHash) {
      const dup = await this.prisma.placeMedia.findFirst({
        where: { placeId, status: 'READY', contentHash: dto.contentHash },
        select: { title: true, location: true },
      });
      if (dup) {
        const where = dup.location === 'VAULT' ? ' (en la bóveda)' : '';
        throw new ConflictException(`${DUPLICATE_PREFIX} "${dup.title}"${where}.`);
      }
    }
    const used = await this.used(placeId, 'GALLERY');
    const quota = p.mediaQuotaMb * MB;
    if (used + dto.sizeBytes > quota) {
      const free = Math.max(0, quota - used);
      throw new ConflictException(
        `No queda espacio: el social tiene ${(free / 1024 ** 3).toFixed(1)} GB libres de ${(quota / 1024 ** 3).toFixed(0)} GB. ` +
          'Mueve archivos a la bóveda o borra algunos.',
      );
    }

    const base = `places/${placeId}/${kindOf(dto.mimeType) === 'PHOTO' ? 'photos' : 'videos'}/${randomUUID()}`;
    const m = await this.prisma.placeMedia.create({
      data: {
        placeId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        recordedOn: ymdToDate(dto.recordedOn),
        storageKey: `${base}.${EXT[dto.mimeType] ?? 'bin'}`,
        thumbKey: `${base}.jpg`,
        mimeType: dto.mimeType,
        sizeBytes: BigInt(dto.sizeBytes),
        contentHash: dto.contentHash ?? null,
        uploadedById: user.id,
      },
      select: { id: true, storageKey: true, thumbKey: true, mimeType: true },
    });
    return {
      mediaId: m.id,
      uploadUrl: await this.media.uploadUrl(m.storageKey, m.mimeType),
      uploadHeaders: { 'Content-Type': m.mimeType },
      thumbUploadUrl: await this.media.uploadUrl(m.thumbKey!, THUMB_MIME),
      thumbUploadHeaders: { 'Content-Type': THUMB_MIME },
    };
  }

  /** El navegador terminó de subir: se verifica el archivo real y queda visible. */
  async completeUpload(
    user: AuthUser,
    placeId: string,
    mediaId: string,
    durationMs?: number,
  ): Promise<PlaceMediaDto> {
    await this.assertManager(user, placeId);
    const m = await this.row(placeId, mediaId);
    if (m.status === 'READY') return this.toDto(m); // idempotente
    const size = await this.media.size(m.storageKey);
    if (size === null) throw new BadRequestException('El archivo no terminó de subir. Intenta de nuevo.');
    // Se descontó del cupo el tamaño declarado: si subió algo más grande, se rechaza.
    if (size > Number(m.sizeBytes)) {
      await this.removeRow(m);
      throw new BadRequestException('El archivo subido no coincide con el declarado.');
    }
    const thumbOk = m.thumbKey ? (await this.media.size(m.thumbKey)) !== null : false;
    const updated = await this.prisma.placeMedia.update({
      where: { id: m.id },
      data: {
        status: 'READY',
        sizeBytes: BigInt(size),
        durationMs: durationMs ?? null,
        ...(thumbOk ? {} : { thumbKey: null }),
      },
      select: SELECT,
    });
    return this.toDto(updated);
  }

  // --- gestión --------------------------------------------------------------------
  async remove(user: AuthUser, placeId: string, mediaId: string): Promise<void> {
    await this.assertManager(user, placeId);
    const m = await this.row(placeId, mediaId);
    await this.removeRow(m);
  }

  /**
   * Mueve entre la galería y la bóveda (R2 Infrequent Access: más barata, solo se
   * descarga). Se copia con la otra clase de almacenamiento y se borra el original.
   */
  async move(user: AuthUser, placeId: string, mediaId: string, to: AcademyMediaLocation): Promise<PlaceMediaDto> {
    const p = await this.assertManager(user, placeId);
    const m = await this.row(placeId, mediaId);
    if (m.status !== 'READY') throw new ConflictException('El archivo todavía se está subiendo.');
    if (m.location === to) return this.toDto(m);
    const [used, quota] =
      to === 'VAULT'
        ? [await this.used(placeId, 'VAULT'), p.vaultQuotaMb * MB]
        : [await this.used(placeId, 'GALLERY'), p.mediaQuotaMb * MB];
    if (used + Number(m.sizeBytes) > quota) {
      throw new ConflictException(
        to === 'VAULT' ? 'La bóveda del social está llena.' : 'No hay espacio en la galería para devolverlo.',
      );
    }
    const file = m.storageKey.split('/').pop()!;
    const folder = to === 'VAULT' ? 'vault' : kindOf(m.mimeType) === 'PHOTO' ? 'photos' : 'videos';
    const newKey = `places/${placeId}/${folder}/${file}`;
    await this.media.copy(m.storageKey, newKey, to === 'VAULT' ? 'STANDARD_IA' : 'STANDARD');
    const updated = await this.prisma.placeMedia.update({
      where: { id: m.id },
      data: { storageKey: newKey, location: to, vaultedAt: to === 'VAULT' ? new Date() : null },
      select: SELECT,
    });
    await this.media.remove(m.storageKey);
    return this.toDto(updated);
  }

  /** SUPER_ADMIN: cambia los cupos del social (en GB). */
  async setQuota(placeId: string, dto: { mediaGb?: number; vaultGb?: number }): Promise<PlaceMediaStorage> {
    const p = await this.place(placeId);
    const data: Prisma.CommunityPlaceUpdateInput = {};
    if (dto.mediaGb !== undefined) data.mediaQuotaMb = Math.round(dto.mediaGb * 1024);
    if (dto.vaultGb !== undefined) data.vaultQuotaMb = Math.round(dto.vaultGb * 1024);
    const u = await this.prisma.communityPlace.update({
      where: { id: p.id },
      data,
      select: { id: true, mediaQuotaMb: true, vaultQuotaMb: true },
    });
    return this.storage(u);
  }
}
