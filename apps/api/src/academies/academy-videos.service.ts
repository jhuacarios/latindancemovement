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
  publicName,
  ACADEMY_PHOTO_MAX_BYTES,
  type AcademyCompatStatus,
  type AcademyMediaKind,
  type AcademyMediaLocation,
  type AcademyVideoDto,
  type AcademyVideoReportDto,
  type AcademyVideoUploadTicket,
  type DanceStyle,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { AcademiesService } from './academies.service';
import { MediaStorageService } from '../media/media-storage.service';
import { staleUploadCutoff } from './upload-stale';
import { DUPLICATE_PREFIX, EXT, THUMB_MIME, downloadName, kindOf, ymdToDate } from '../media/media-files';
import { AcademyCompatQueue, AcademyCompatService } from './academy-compat.service';
import {
  CheckDuplicatesDto,
  CompleteVideoUploadDto,
  CreateVideoUploadDto,
  ListVideosQueryDto,
  MoveMediaDto,
  ReportVideoDto,
  UpdateVideoDto,
} from './dto/academy.dto';

/** Re-export: el controller y el web dependen de este nombre. */
export { DUPLICATE_PREFIX };

export const VIDEO_SELECT = {
  id: true,
  academyId: true,
  classId: true,
  class: { select: { title: true } },
  title: true,
  description: true,
  style: true,
  recordedOn: true,
  storageKey: true,
  thumbKey: true,
  mimeType: true,
  sizeBytes: true,
  durationMs: true,
  status: true,
  location: true,
  vaultedAt: true,
  compatStatus: true,
  compatKey: true,
  compatSizeBytes: true,
  uploadedById: true,
  uploadedBy: { select: { name: true, displayName: true } },
  createdAt: true,
} satisfies Prisma.AcademyVideoSelect;

export type VideoRow = Prisma.AcademyVideoGetPayload<{ select: typeof VIDEO_SELECT }>;

/** Nombre con que se descarga: el título, con la extensión si no la trae. */
export { downloadName };

/** Nombre de la copia MP4: el título sin su extensión, terminado en .mp4. */
export function compatDownloadName(v: { title: string }): string {
  return `${v.title.replace(/\.(mp4|m4v|mov|webm)$/i, '')}.mp4`;
}

export type DownloadFormat = 'original' | 'mp4';

/**
 * Qué URL dar para VER: la copia compatible si existe (se reproduce en todos los
 * navegadores), si no el original.
 */
export function playableKey(v: { storageKey: string; compatStatus: string | null; compatKey: string | null }): string {
  return v.compatStatus === 'DONE' && v.compatKey ? v.compatKey : v.storageKey;
}

/** Key y nombre de la descarga pedida (409 si piden el MP4 y no hay copia). */
export function downloadTarget(
  v: { storageKey: string; title: string; mimeType: string; compatStatus: string | null; compatKey: string | null },
  format: DownloadFormat,
): { key: string; name: string } {
  if (format === 'mp4') {
    if (v.mimeType === 'video/mp4' && v.compatStatus !== 'DONE') return { key: v.storageKey, name: downloadName(v) };
    if (v.compatStatus !== 'DONE' || !v.compatKey) {
      throw new ConflictException('La versión MP4 de este video todavía no está lista.');
    }
    return { key: v.compatKey, name: compatDownloadName(v) };
  }
  return { key: v.storageKey, name: downloadName(v) };
}

const toDate = ymdToDate;

/**
 * Videos de las academias. El navegador sube el video y su miniatura directo al
 * bucket privado de media (URL firmada); para verlos, la API firma URLs de 1 h.
 * Los ve cualquier usuario con cuenta; suben y editan el dueño y los profesores.
 */
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class AcademyVideosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AcademyVideosService.name);
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly academies: AcademiesService,
    private readonly media: MediaStorageService,
    private readonly compatQueue: AcademyCompatQueue,
    private readonly compat: AcademyCompatService,
  ) {}

  async toDto(v: VideoRow): Promise<AcademyVideoDto> {
    return {
      id: v.id,
      academyId: v.academyId,
      kind: kindOf(v.mimeType),
      location: v.location as AcademyMediaLocation,
      vaultedAt: v.vaultedAt?.toISOString() ?? null,
      compat: {
        status: v.compatStatus as AcademyCompatStatus | null,
        sizeBytes: v.compatSizeBytes === null ? null : Number(v.compatSizeBytes),
      },
      classId: v.classId,
      classTitle: v.class?.title ?? null,
      title: v.title,
      description: v.description,
      style: v.style as DanceStyle | null,
      recordedOn: v.recordedOn ? v.recordedOn.toISOString().slice(0, 10) : null,
      mimeType: v.mimeType,
      sizeBytes: Number(v.sizeBytes),
      durationMs: v.durationMs,
      thumbUrl: v.thumbKey && this.media.enabled ? await this.media.viewUrl(v.thumbKey) : null,
      uploadedById: v.uploadedById,
      uploadedByName: publicName(v.uploadedBy),
      createdAt: v.createdAt.toISOString(),
    };
  }

  private async video(academyId: string, videoId: string): Promise<VideoRow> {
    const v = await this.prisma.academyVideo.findFirst({
      where: { id: videoId, academyId },
      select: VIDEO_SELECT,
    });
    if (!v) throw new NotFoundException('Video no encontrado.');
    return v;
  }

  async list(user: AuthUser, academyId: string, q: ListVideosQueryDto): Promise<AcademyVideoDto[]> {
    await this.academies.roleIn(user, academyId); // 404 si la academia no existe
    const rows = await this.prisma.academyVideo.findMany({
      where: { academyId, status: 'READY', location: 'GALLERY', ...(q.classId ? { classId: q.classId } : {}) },
      select: VIDEO_SELECT,
      orderBy: [{ recordedOn: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  /**
   * Limpieza de subidas abandonadas de TODAS las academias: al arrancar (con un
   * respiro) y cada 6 h. Antes solo se limpiaban cuando alguien volvía a subir en
   * esa academia, y mientras tanto inflaban el cupo.
   */
  onModuleInit(): void {
    this.cleanupTimer = setTimeout(() => {
      void this.cleanStaleAll();
      this.cleanupTimer = setInterval(() => void this.cleanStaleAll(), CLEANUP_EVERY_MS);
      this.cleanupTimer.unref?.();
    }, 60_000);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
  }

  async cleanStaleAll(): Promise<number> {
    try {
      const stale = await this.prisma.academyVideo.findMany({
        where: { status: 'UPLOADING', createdAt: { lt: staleUploadCutoff() } },
        select: { id: true, storageKey: true, thumbKey: true },
      });
      for (const v of stale) await this.removeRow(v);
      if (stale.length) this.logger.log(`Subidas abandonadas borradas: ${stale.length}`);
      return stale.length;
    } catch (e) {
      this.logger.warn(`No se pudieron limpiar las subidas abandonadas: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Borra las subidas abandonadas de la academia (liberan cupo). */
  private async cleanStale(academyId: string): Promise<void> {
    const stale = await this.prisma.academyVideo.findMany({
      where: { academyId, status: 'UPLOADING', createdAt: { lt: staleUploadCutoff() } },
      select: { id: true, storageKey: true, thumbKey: true },
    });
    for (const v of stale) await this.removeRow(v);
  }

  private async removeRow(v: { id: string; storageKey: string; thumbKey: string | null }): Promise<void> {
    const extra = await this.prisma.academyVideo.findUnique({
      where: { id: v.id },
      select: { pendingThumbKey: true, compatKey: true },
    });
    await this.prisma.academyVideo.delete({ where: { id: v.id } });
    await this.media.remove(v.storageKey);
    if (v.thumbKey) await this.media.remove(v.thumbKey);
    if (extra?.pendingThumbKey) await this.media.remove(extra.pendingThumbKey);
    if (extra?.compatKey) await this.media.remove(extra.compatKey);
  }

  /**
   * De las huellas dadas, cuáles ya están en la galería. Solo cuentan las subidas
   * completas: una que quedó a medias no impide reintentarla.
   */
  async findDuplicates(
    user: AuthUser,
    academyId: string,
    dto: CheckDuplicatesDto,
  ): Promise<{ hash: string; videoId: string; title: string; location: AcademyMediaLocation }[]> {
    await this.academies.assertMember(user, academyId);
    if (dto.hashes.length === 0) return [];
    const rows = await this.prisma.academyVideo.findMany({
      where: { academyId, status: 'READY', contentHash: { in: dto.hashes } },
      select: { id: true, title: true, contentHash: true, location: true },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => r.contentHash && !seen.has(r.contentHash) && seen.add(r.contentHash))
      .map((r) => ({
        hash: r.contentHash!,
        videoId: r.id,
        title: r.title,
        location: r.location as AcademyMediaLocation,
      }));
  }

  async createUpload(
    user: AuthUser,
    academyId: string,
    dto: CreateVideoUploadDto,
  ): Promise<AcademyVideoUploadTicket> {
    await this.academies.assertMember(user, academyId);
    await this.academies.assertPlan(academyId);
    this.media.assertEnabled();
    if (kindOf(dto.mimeType) === 'PHOTO' && dto.sizeBytes > ACADEMY_PHOTO_MAX_BYTES) {
      throw new BadRequestException('La foto no puede superar 25 MB.');
    }
    if (dto.classId) await this.academies.assertClass(academyId, dto.classId);

    await this.cleanStale(academyId);
    if (dto.contentHash) {
      const dup = await this.prisma.academyVideo.findFirst({
        where: { academyId, status: 'READY', contentHash: dto.contentHash },
        select: { title: true, location: true },
      });
      // El mensaje empieza igual siempre: el navegador lo usa para saltarlo sin cortar el lote.
      if (dup) {
        const where = dup.location === 'VAULT' ? ' (en la bóveda)' : '';
        throw new ConflictException(`${DUPLICATE_PREFIX} "${dup.title}"${where}.`);
      }
    }
    const [used, quota] = await Promise.all([
      this.academies.usedBytes(academyId),
      this.academies.quotaBytes(academyId),
    ]);
    if (used + dto.sizeBytes > quota) {
      const free = Math.max(0, quota - used);
      throw new ConflictException(
        `No queda espacio para este video: la academia tiene ${(free / 1024 ** 3).toFixed(1)} GB libres de ${(quota / 1024 ** 3).toFixed(0)} GB.`,
      );
    }

    const base = `academies/${academyId}/${kindOf(dto.mimeType) === 'PHOTO' ? 'photos' : 'videos'}/${randomUUID()}`;
    const v = await this.prisma.academyVideo.create({
      data: {
        academyId,
        classId: dto.classId ?? null,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        style: dto.style ?? null,
        recordedOn: toDate(dto.recordedOn),
        storageKey: `${base}.${EXT[dto.mimeType] ?? 'bin'}`,
        thumbKey: `${base}.jpg`,
        mimeType: dto.mimeType,
        sizeBytes: BigInt(dto.sizeBytes),
        contentHash: dto.contentHash ?? null,
        uploadedById: user.id,
      },
    });
    return {
      videoId: v.id,
      uploadUrl: await this.media.uploadUrl(v.storageKey, v.mimeType),
      uploadHeaders: { 'Content-Type': v.mimeType },
      thumbUploadUrl: await this.media.uploadUrl(v.thumbKey!, THUMB_MIME),
      thumbUploadHeaders: { 'Content-Type': THUMB_MIME },
    };
  }

  /** El navegador terminó de subir: se verifica el archivo real y queda visible. */
  async completeUpload(
    user: AuthUser,
    academyId: string,
    videoId: string,
    dto: CompleteVideoUploadDto,
  ): Promise<AcademyVideoDto> {
    await this.academies.assertMember(user, academyId);
    const v = await this.video(academyId, videoId);
    if (v.status === 'READY') return this.toDto(v); // idempotente

    const size = await this.media.size(v.storageKey);
    if (size === null) throw new BadRequestException('El video no terminó de subir. Intenta de nuevo.');
    // El tamaño declarado fue el que se descontó del cupo: si subió algo más grande, se rechaza.
    if (size > Number(v.sizeBytes)) {
      await this.removeRow(v);
      throw new BadRequestException('El archivo subido no coincide con el declarado. Vuelve a subirlo.');
    }
    const thumb = v.thumbKey ? await this.media.size(v.thumbKey) : null;
    const updated = await this.prisma.academyVideo.update({
      where: { id: v.id },
      data: {
        status: 'READY',
        sizeBytes: BigInt(size),
        durationMs: dto.durationMs ?? null,
        thumbKey: thumb ? v.thumbKey : null, // sin miniatura si no se pudo sacar
      },
      select: VIDEO_SELECT,
    });
    // Videos: copia MP4 compatible en segundo plano (si hace falta).
    if (kindOf(updated.mimeType) === 'VIDEO') {
      await this.compatQueue.enqueue(updated.id);
      return this.toDto({ ...updated, compatStatus: this.compatQueue.enabled ? 'PENDING' : null });
    }
    return this.toDto(updated);
  }

  async update(user: AuthUser, academyId: string, videoId: string, dto: UpdateVideoDto): Promise<AcademyVideoDto> {
    await this.academies.assertMember(user, academyId);
    await this.video(academyId, videoId);
    if (dto.classId) await this.academies.assertClass(academyId, dto.classId);
    const data: Prisma.AcademyVideoUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.classId !== undefined) data.classId = dto.classId;
    if (dto.style !== undefined) data.style = dto.style;
    if (dto.recordedOn !== undefined) data.recordedOn = toDate(dto.recordedOn);
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    const updated = await this.prisma.academyVideo.update({ where: { id: videoId }, data, select: VIDEO_SELECT });
    return this.toDto(updated);
  }

  /** El director borra cualquier archivo; un profesor, solo lo que subió él. */
  async remove(user: AuthUser, academyId: string, videoId: string): Promise<void> {
    const role = await this.academies.assertMember(user, academyId);
    const v = await this.video(academyId, videoId);
    if (role === 'TEACHER' && v.uploadedById !== user.id) {
      throw new ForbiddenException(
        'Solo el director puede eliminar lo que subieron otros. Puedes moverlo a la bóveda para liberar espacio.',
      );
    }
    await this.removeRow(v);
  }

  /** URL firmada (1 h) para reproducir. Cualquier usuario con cuenta; lo de la bóveda no. */
  async viewUrl(user: AuthUser, academyId: string, videoId: string): Promise<{ url: string }> {
    const v = await this.video(academyId, videoId);
    if (v.location === 'VAULT') {
      // Para quien no administra, lo de la bóveda no existe.
      if (!(await this.academies.roleIn(user, academyId))) throw new NotFoundException('Video no encontrado.');
      throw new ConflictException('Este archivo está en la bóveda: no se reproduce, solo se descarga.');
    }
    if (v.status !== 'READY') throw new ConflictException('El archivo todavía se está subiendo.');
    return { url: await this.media.viewUrl(playableKey(v)) };
  }

  /**
   * URL para reemplazar la miniatura (dueño y profesores): el navegador saca un
   * cuadro del video (p. ej. cuando la automática salió negra) y lo sube directo.
   */
  async thumbUpload(
    user: AuthUser,
    academyId: string,
    videoId: string,
  ): Promise<{ uploadUrl: string; uploadHeaders: Record<string, string> }> {
    await this.academies.assertMember(user, academyId);
    this.media.assertEnabled();
    const v = await this.video(academyId, videoId);
    // Clave nueva cada vez: la URL firmada anterior (y su caché) no muestra la vieja.
    const thumbKey = `academies/${academyId}/thumbs/${v.id}-${randomUUID().slice(0, 8)}.jpg`;
    const uploadUrl = await this.media.uploadUrl(thumbKey, THUMB_MIME);
    await this.prisma.academyVideo.update({ where: { id: v.id }, data: { pendingThumbKey: thumbKey } });
    return { uploadUrl, uploadHeaders: { 'Content-Type': THUMB_MIME } };
  }

  /** Confirma la miniatura nueva (ya subida) y borra la anterior. */
  async thumbComplete(user: AuthUser, academyId: string, videoId: string): Promise<AcademyVideoDto> {
    await this.academies.assertMember(user, academyId);
    const row = await this.prisma.academyVideo.findFirst({
      where: { id: videoId, academyId },
      select: { thumbKey: true, pendingThumbKey: true },
    });
    if (!row) throw new NotFoundException('Video no encontrado.');
    if (!row.pendingThumbKey || (await this.media.size(row.pendingThumbKey)) === null) {
      throw new BadRequestException('La miniatura no terminó de subir. Intenta de nuevo.');
    }
    const updated = await this.prisma.academyVideo.update({
      where: { id: videoId },
      data: { thumbKey: row.pendingThumbKey, pendingThumbKey: null },
      select: VIDEO_SELECT,
    });
    if (row.thumbKey && row.thumbKey !== row.pendingThumbKey) await this.media.remove(row.thumbKey);
    return this.toDto(updated);
  }

  // --- bóveda -------------------------------------------------------------------

  /** Lo que está en la bóveda (solo quienes administran). */
  async listVault(user: AuthUser, academyId: string): Promise<AcademyVideoDto[]> {
    await this.academies.assertMember(user, academyId);
    const rows = await this.prisma.academyVideo.findMany({
      where: { academyId, status: 'READY', location: 'VAULT' },
      select: VIDEO_SELECT,
      orderBy: [{ vaultedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  /**
   * URL firmada que descarga el original, o la copia MP4 (`format=mp4`), con su
   * nombre (solo quienes administran).
   */
  async downloadUrl(
    user: AuthUser,
    academyId: string,
    videoId: string,
    format: DownloadFormat = 'original',
  ): Promise<{ url: string }> {
    await this.academies.assertMember(user, academyId);
    const v = await this.video(academyId, videoId);
    if (v.status !== 'READY') throw new ConflictException('El archivo todavía se está subiendo.');
    const t = downloadTarget(v, format);
    return { url: await this.media.downloadUrl(t.key, t.name) };
  }

  /**
   * Mueve archivos entre la galería y la bóveda. En la bóveda quedan en R2
   * Infrequent Access (más barato por GB, solo descarga) y cuentan en el cupo de la
   * bóveda, no en el de la galería. Se copia con la nueva clase y se borra el
   * anterior; si algo falla a mitad, el archivo sigue donde estaba.
   */
  async move(
    user: AuthUser,
    academyId: string,
    dto: MoveMediaDto,
    to: AcademyMediaLocation,
  ): Promise<{ moved: number }> {
    await this.academies.assertMember(user, academyId);
    await this.academies.assertPlan(academyId);
    this.media.assertEnabled();
    const from: AcademyMediaLocation = to === 'VAULT' ? 'GALLERY' : 'VAULT';
    const rows = await this.prisma.academyVideo.findMany({
      where: { academyId, id: { in: dto.videoIds }, status: 'READY', location: from },
      select: { id: true, storageKey: true, sizeBytes: true, mimeType: true },
    });
    if (rows.length === 0) return { moved: 0 };

    const [used, quota] = await Promise.all([
      this.academies.usedBytes(academyId, to),
      this.academies.quotaBytes(academyId, to),
    ]);
    const adding = rows.reduce((s, r) => s + Number(r.sizeBytes), 0);
    if (used + adding > quota) {
      const free = Math.max(0, quota - used);
      const where = to === 'VAULT' ? 'la bóveda' : 'la galería';
      throw new ConflictException(
        `No hay espacio en ${where}: quedan ${(free / 1024 ** 3).toFixed(1)} GB libres y estos archivos suman ${(adding / 1024 ** 3).toFixed(1)} GB.`,
      );
    }

    let moved = 0;
    for (const r of rows) {
      const file = r.storageKey.split('/').pop()!;
      const folder = to === 'VAULT' ? 'vault' : kindOf(r.mimeType) === 'PHOTO' ? 'photos' : 'videos';
      const newKey = `academies/${academyId}/${folder}/${file}`;
      await this.media.copy(r.storageKey, newKey, to === 'VAULT' ? 'STANDARD_IA' : 'STANDARD');
      await this.prisma.academyVideo.update({
        where: { id: r.id },
        data: { storageKey: newKey, location: to, vaultedAt: to === 'VAULT' ? new Date() : null },
      });
      if (newKey !== r.storageKey) await this.media.remove(r.storageKey);
      // La copia MP4 solo existe para lo de la galería (no se cobra guardarla en la bóveda).
      if (to === 'VAULT') await this.compat.discard(r.id);
      else if (kindOf(r.mimeType) === 'VIDEO') await this.compatQueue.enqueue(r.id);
      moved++;
    }
    return { moved };
  }

  // --- reportes -----------------------------------------------------------------

  async report(user: AuthUser, academyId: string, videoId: string, dto: ReportVideoDto): Promise<void> {
    await this.video(academyId, videoId);
    await this.prisma.academyVideoReport.upsert({
      where: { videoId_reporterId: { videoId, reporterId: user.id } },
      create: { videoId, reporterId: user.id, reason: dto.reason.trim() },
      update: { reason: dto.reason.trim(), resolvedAt: null },
    });
  }

  /** Reportes pendientes (SUPER_ADMIN). */
  async pendingReports(): Promise<AcademyVideoReportDto[]> {
    const rows = await this.prisma.academyVideoReport.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        reporter: { select: { name: true } },
        video: { select: { id: true, title: true, academy: { select: { id: true, name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      videoId: r.video.id,
      videoTitle: r.video.title,
      academyId: r.video.academy.id,
      academyName: r.video.academy.name,
      reporterName: r.reporter.name,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Marca el reporte como revisado (si el video se quitó, el reporte se borró con él). */
  async resolveReport(reportId: string): Promise<void> {
    const r = await this.prisma.academyVideoReport.findUnique({ where: { id: reportId } });
    if (!r) throw new NotFoundException('Reporte no encontrado.');
    await this.prisma.academyVideoReport.update({ where: { id: reportId }, data: { resolvedAt: new Date() } });
  }
}
