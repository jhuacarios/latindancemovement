import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AcademyShareAccess,
  AcademyShareLinkDto,
  ChileRegion,
  ClassLevel,
  DanceStyle,
  SharedClassDto,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { AcademiesService } from './academies.service';
import {
  AcademyVideosService,
  VIDEO_SELECT,
  downloadTarget,
  playableKey,
  type DownloadFormat,
} from './academy-videos.service';
import { MediaStorageService } from './media-storage.service';

/**
 * Links para compartir las fotos y videos de UNA clase con personas externas.
 * Hoy son públicos: cualquiera con el link ve y descarga, sin cuenta (solo lo que
 * está en la galería; la bóveda no). Una clase tiene a lo más un link activo:
 * pedir uno nuevo desactiva el anterior.
 */
@Injectable()
export class AcademyShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academies: AcademiesService,
    private readonly videos: AcademyVideosService,
    private readonly media: MediaStorageService,
  ) {}

  private toDto(l: {
    id: string;
    token: string;
    classId: string;
    access: string;
    createdAt: Date;
    createdBy: { name: string };
  }): AcademyShareLinkDto {
    return {
      id: l.id,
      token: l.token,
      classId: l.classId,
      access: l.access as AcademyShareAccess,
      createdByName: l.createdBy.name,
      createdAt: l.createdAt.toISOString(),
    };
  }

  private active(classId: string) {
    return this.prisma.academyShareLink.findFirst({
      where: { classId, revokedAt: null },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- gestión (dueño y profesores) ---------------------------------------------

  async get(user: AuthUser, academyId: string, classId: string): Promise<AcademyShareLinkDto | null> {
    await this.academies.assertMember(user, academyId);
    await this.academies.assertClass(academyId, classId);
    const l = await this.active(classId);
    return l ? this.toDto(l) : null;
  }

  /** Crea el link de la clase (el anterior, si había, deja de funcionar). */
  async create(user: AuthUser, academyId: string, classId: string): Promise<AcademyShareLinkDto> {
    await this.academies.assertMember(user, academyId);
    await this.academies.assertClass(academyId, classId);
    await this.prisma.academyShareLink.updateMany({
      where: { classId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const l = await this.prisma.academyShareLink.create({
      data: { token: randomBytes(18).toString('base64url'), academyId, classId, createdById: user.id },
      include: { createdBy: { select: { name: true } } },
    });
    return this.toDto(l);
  }

  async revoke(user: AuthUser, academyId: string, classId: string): Promise<void> {
    await this.academies.assertMember(user, academyId);
    await this.academies.assertClass(academyId, classId);
    await this.prisma.academyShareLink.updateMany({
      where: { classId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // --- acceso público por token ---------------------------------------------------

  private async link(token: string) {
    const l = await this.prisma.academyShareLink.findUnique({
      where: { token },
      select: { revokedAt: true, access: true, academyId: true, classId: true },
    });
    if (!l || l.revokedAt) throw new NotFoundException('Este link no existe o fue desactivado.');
    // MEMBERS (futuro): acá se pedirá la sesión y ser miembro de la academia.
    if (l.access !== 'PUBLIC') throw new NotFoundException('Este link no existe o fue desactivado.');
    return l;
  }

  async shared(token: string): Promise<SharedClassDto> {
    const l = await this.link(token);
    const [academy, cls, rows] = await Promise.all([
      this.prisma.academy.findUniqueOrThrow({
        where: { id: l.academyId },
        select: { id: true, name: true, logoMime: true, city: true, commune: true, region: true, instagramHandle: true },
      }),
      this.prisma.academyClass.findUniqueOrThrow({ where: { id: l.classId } }),
      this.prisma.academyVideo.findMany({
        where: { classId: l.classId, status: 'READY', location: 'GALLERY' },
        select: VIDEO_SELECT,
        orderBy: [{ recordedOn: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      }),
    ]);
    return {
      academy: {
        id: academy.id,
        name: academy.name,
        hasLogo: Boolean(academy.logoMime),
        city: academy.city,
        commune: academy.commune,
        region: academy.region as ChileRegion,
        instagramHandle: academy.instagramHandle,
      },
      class: {
        id: cls.id,
        title: cls.title,
        style: cls.style as DanceStyle | null,
        level: cls.level as ClassLevel,
        weekday: cls.weekday,
        startTime: cls.startTime,
        durationMin: cls.durationMin,
        teacherName: cls.teacherName,
      },
      items: await Promise.all(rows.map((r) => this.videos.toDto(r))),
    };
  }

  private async sharedItem(token: string, videoId: string) {
    const l = await this.link(token);
    const v = await this.prisma.academyVideo.findFirst({
      where: { id: videoId, classId: l.classId, location: 'GALLERY' },
      select: { storageKey: true, status: true, title: true, mimeType: true, compatStatus: true, compatKey: true },
    });
    if (!v) throw new NotFoundException('Archivo no encontrado.');
    if (v.status !== 'READY') throw new ConflictException('El archivo todavía se está subiendo.');
    return v;
  }

  async viewUrl(token: string, videoId: string): Promise<{ url: string }> {
    const v = await this.sharedItem(token, videoId);
    return { url: await this.media.viewUrl(playableKey(v)) };
  }

  async downloadUrl(token: string, videoId: string, format: DownloadFormat = 'original'): Promise<{ url: string }> {
    const v = await this.sharedItem(token, videoId);
    const t = downloadTarget(v, format);
    return { url: await this.media.downloadUrl(t.key, t.name) };
  }
}
