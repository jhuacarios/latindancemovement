import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ACADEMY_PHOTO_MAX_BYTES,
  type AcademyMediaKind,
  type AcademyVideoDto,
  type AcademyVideoReportDto,
  type AcademyVideoUploadTicket,
  type DanceStyle,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { AcademiesService } from './academies.service';
import { MediaStorageService } from './media-storage.service';
import {
  CheckDuplicatesDto,
  CompleteVideoUploadDto,
  CreateVideoUploadDto,
  ListVideosQueryDto,
  ReportVideoDto,
  UpdateVideoDto,
} from './dto/academy.dto';

const THUMB_MIME = 'image/jpeg';
/** Inicio del mensaje de un archivo repetido (ver lib/academies.ts del web). */
export const DUPLICATE_PREFIX = 'Ya está en la galería:';
/** Una subida que no se confirmó en este tiempo se da por abandonada (libera el cupo). */
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

const EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const kindOf = (mime: string): AcademyMediaKind => (mime.startsWith('image/') ? 'PHOTO' : 'VIDEO');

const VIDEO_SELECT = {
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
  uploadedBy: { select: { name: true } },
  createdAt: true,
} satisfies Prisma.AcademyVideoSelect;

type VideoRow = Prisma.AcademyVideoGetPayload<{ select: typeof VIDEO_SELECT }>;

const toDate = (ymd: string | null | undefined) => (ymd ? new Date(`${ymd}T12:00:00Z`) : null);

/**
 * Videos de las academias. El navegador sube el video y su miniatura directo al
 * bucket privado de media (URL firmada); para verlos, la API firma URLs de 1 h.
 * Los ve cualquier usuario con cuenta; suben y editan el dueño y los profesores.
 */
@Injectable()
export class AcademyVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academies: AcademiesService,
    private readonly media: MediaStorageService,
  ) {}

  private async toDto(v: VideoRow): Promise<AcademyVideoDto> {
    return {
      id: v.id,
      academyId: v.academyId,
      kind: kindOf(v.mimeType),
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
      uploadedByName: v.uploadedBy.name,
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
      where: { academyId, status: 'READY', ...(q.classId ? { classId: q.classId } : {}) },
      select: VIDEO_SELECT,
      orderBy: [{ recordedOn: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  /** Borra las subidas abandonadas de la academia (liberan cupo). */
  private async cleanStale(academyId: string): Promise<void> {
    const stale = await this.prisma.academyVideo.findMany({
      where: { academyId, status: 'UPLOADING', createdAt: { lt: new Date(Date.now() - STALE_UPLOAD_MS) } },
      select: { id: true, storageKey: true, thumbKey: true },
    });
    for (const v of stale) await this.removeRow(v);
  }

  private async removeRow(v: { id: string; storageKey: string; thumbKey: string | null }): Promise<void> {
    await this.prisma.academyVideo.delete({ where: { id: v.id } });
    await this.media.remove(v.storageKey);
    if (v.thumbKey) await this.media.remove(v.thumbKey);
  }

  /**
   * De las huellas dadas, cuáles ya están en la galería. Solo cuentan las subidas
   * completas: una que quedó a medias no impide reintentarla.
   */
  async findDuplicates(
    user: AuthUser,
    academyId: string,
    dto: CheckDuplicatesDto,
  ): Promise<{ hash: string; videoId: string; title: string }[]> {
    await this.academies.assertMember(user, academyId);
    if (dto.hashes.length === 0) return [];
    const rows = await this.prisma.academyVideo.findMany({
      where: { academyId, status: 'READY', contentHash: { in: dto.hashes } },
      select: { id: true, title: true, contentHash: true },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => r.contentHash && !seen.has(r.contentHash) && seen.add(r.contentHash))
      .map((r) => ({ hash: r.contentHash!, videoId: r.id, title: r.title }));
  }

  async createUpload(
    user: AuthUser,
    academyId: string,
    dto: CreateVideoUploadDto,
  ): Promise<AcademyVideoUploadTicket> {
    await this.academies.assertMember(user, academyId);
    this.media.assertEnabled();
    if (kindOf(dto.mimeType) === 'PHOTO' && dto.sizeBytes > ACADEMY_PHOTO_MAX_BYTES) {
      throw new BadRequestException('La foto no puede superar 25 MB.');
    }
    if (dto.classId) await this.academies.assertClass(academyId, dto.classId);

    await this.cleanStale(academyId);
    if (dto.contentHash) {
      const dup = await this.prisma.academyVideo.findFirst({
        where: { academyId, status: 'READY', contentHash: dto.contentHash },
        select: { title: true },
      });
      // El mensaje empieza igual siempre: el navegador lo usa para saltarlo sin cortar el lote.
      if (dup) throw new ConflictException(`${DUPLICATE_PREFIX} "${dup.title}".`);
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

  async remove(user: AuthUser, academyId: string, videoId: string): Promise<void> {
    await this.academies.assertMember(user, academyId);
    await this.removeRow(await this.video(academyId, videoId));
  }

  /** URL firmada (1 h) para reproducir. Cualquier usuario con cuenta. */
  async viewUrl(user: AuthUser, academyId: string, videoId: string): Promise<{ url: string }> {
    const v = await this.video(academyId, videoId);
    if (v.status !== 'READY') throw new ConflictException('El archivo todavía se está subiendo.');
    return { url: await this.media.viewUrl(v.storageKey) };
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
