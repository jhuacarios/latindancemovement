import { placeData, type PlaceFields } from '../common/place';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AcademyAdminRowDto,
  AcademyClassDto,
  AcademyDto,
  AcademyMediaLocation,
  AcademyMemberRole,
  AcademyPlanDto,
  AcademySummaryDto,
  ChileRegion,
  ClassLevel,
  DanceStyle,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { UploadedImage } from '../common/multipart';
import { MediaStorageService } from './media-storage.service';
import {
  AddMemberDto,
  CreateAcademyDto,
  CreateClassDto,
  QueryAcademiesDto,
  SetAcademyPlanDto,
  SetDirectorDto,
  UpdateAcademyDto,
  UpdateClassDto,
} from './dto/academy.dto';

const MB = 1024 * 1024;
const csv = (v: string) => v.split(',').filter(Boolean);
const text = (v: string | null | undefined) => v?.trim() || null;
const normHandle = (h: string | null | undefined) => h?.trim().replace(/^@/, '').toLowerCase() || null;

/** Todo menos el logo (base64, pesado). */
const SUMMARY = {
  id: true,
  name: true,
  region: true,
  city: true,
  commune: true,
  styles: true,
  instagramHandle: true,
  logoMime: true,
  members: { select: { userId: true, role: true } },
  _count: {
    select: { classes: { where: { active: true } }, videos: { where: { status: 'READY', location: 'GALLERY' } } },
  },
} satisfies Prisma.AcademySelect;

type SummaryRow = Prisma.AcademyGetPayload<{ select: typeof SUMMARY }>;
type ClassRow = Prisma.AcademyClassGetPayload<object>;

const GB_MB = 1024;

/** Plan Director vigente = tiene fecha y no ha vencido. */
export function planOf(expiresAt: Date | null, now = new Date()): AcademyPlanDto {
  return { active: expiresAt !== null && expiresAt > now, expiresAt: expiresAt?.toISOString() ?? null };
}

export const NO_PLAN_MESSAGE =
  'La academia no tiene el Plan Director vigente: se puede ver y descargar todo, pero no subir ni mover archivos. Pide al director que lo renueve.';

const CLASS_ORDER: Prisma.AcademyClassOrderByWithRelationInput[] = [{ weekday: 'asc' }, { startTime: 'asc' }];

/**
 * Academias: perfil, profesores y horario de clases (los videos están en
 * AcademyVideosService). Se ven con cualquier cuenta; editan el dueño, los
 * profesores y el SUPER_ADMIN.
 */
@Injectable()
export class AcademiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaStorageService,
  ) {}

  // --- permisos -----------------------------------------------------------------

  /** Rol del usuario en la academia (el SUPER_ADMIN cuenta como dueño). 404 si no existe. */
  async roleIn(user: AuthUser, academyId: string): Promise<AcademyMemberRole | null> {
    const a = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { members: { where: { userId: user.id }, select: { role: true } } },
    });
    if (!a) throw new NotFoundException('Academia no encontrada.');
    if (user.role === 'SUPER_ADMIN') return 'OWNER';
    return (a.members[0]?.role as AcademyMemberRole | undefined) ?? null;
  }

  /** Dueño o profesor (o SUPER_ADMIN). */
  async assertMember(user: AuthUser, academyId: string): Promise<AcademyMemberRole> {
    const role = await this.roleIn(user, academyId);
    if (!role) throw new ForbiddenException('Solo el dueño y los profesores de la academia pueden hacer esto.');
    return role;
  }

  async assertOwner(user: AuthUser, academyId: string): Promise<void> {
    const role = await this.roleIn(user, academyId);
    if (role !== 'OWNER') throw new ForbiddenException('Solo el director de la academia puede hacer esto.');
  }

  /** Subir y mover archivos requiere el Plan Director vigente (sin él: solo lectura). */
  async assertPlan(academyId: string): Promise<void> {
    const a = await this.prisma.academy.findUnique({ where: { id: academyId }, select: { planExpiresAt: true } });
    if (!a) throw new NotFoundException('Academia no encontrada.');
    if (!planOf(a.planExpiresAt).active) throw new ForbiddenException(NO_PLAN_MESSAGE);
  }

  // --- mapeos -------------------------------------------------------------------

  private toSummary(r: SummaryRow, user: AuthUser): AcademySummaryDto {
    const m = r.members.find((x) => x.userId === user.id);
    return {
      id: r.id,
      name: r.name,
      region: r.region as ChileRegion,
      city: r.city,
      commune: r.commune,
      styles: csv(r.styles) as DanceStyle[],
      instagramHandle: r.instagramHandle,
      hasLogo: Boolean(r.logoMime),
      classCount: r._count.classes,
      videoCount: r._count.videos,
      myRole: (m?.role as AcademyMemberRole | undefined) ?? null,
    };
  }

  private toClass(c: ClassRow): AcademyClassDto {
    return {
      id: c.id,
      title: c.title,
      style: c.style as DanceStyle | null,
      level: c.level as ClassLevel,
      weekday: c.weekday,
      startTime: c.startTime,
      durationMin: c.durationMin,
      teacherName: c.teacherName,
      place: c.place,
      priceInfo: c.priceInfo,
      description: c.description,
      active: c.active,
    };
  }

  private toData(dto: UpdateAcademyDto, current?: PlaceFields | null): Prisma.AcademyUpdateInput {
    const data: Prisma.AcademyUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.region !== undefined) data.region = dto.region;
    const place = placeData(dto, current);
    if (place) Object.assign(data, place);
    if (dto.address !== undefined) data.address = text(dto.address);
    if (dto.styles !== undefined) data.styles = dto.styles.join(',');
    if (dto.description !== undefined) data.description = text(dto.description);
    if (dto.instagramHandle !== undefined) data.instagramHandle = normHandle(dto.instagramHandle);
    return data;
  }

  // --- academias ----------------------------------------------------------------

  async list(user: AuthUser, q: QueryAcademiesDto): Promise<AcademySummaryDto[]> {
    const rows = await this.prisma.academy.findMany({
      where: q.region ? { region: q.region } : {},
      select: SUMMARY,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toSummary(r, user));
  }

  /** Las academias que el usuario administra (dueño o profesor). */
  async mine(user: AuthUser): Promise<AcademySummaryDto[]> {
    const rows = await this.prisma.academy.findMany({
      where: { members: { some: { userId: user.id } } },
      select: SUMMARY,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toSummary(r, user));
  }

  async findOne(user: AuthUser, id: string): Promise<AcademyDto> {
    const a = await this.prisma.academy.findUnique({
      where: { id },
      select: {
        ...SUMMARY,
        address: true,
        description: true,
        storageQuotaMb: true,
        vaultQuotaMb: true,
        planExpiresAt: true,
        createdAt: true,
        classes: { orderBy: CLASS_ORDER },
        members: {
          select: { userId: true, role: true, user: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!a) throw new NotFoundException('Academia no encontrada.');
    const summary = this.toSummary(a, user);
    const manages = summary.myRole !== null || user.role === 'SUPER_ADMIN';
    return {
      ...summary,
      address: a.address,
      description: a.description,
      // Quien no la administra ve solo las clases activas, y no ve correos ni el cupo.
      classes: a.classes.filter((c) => manages || c.active).map((c) => this.toClass(c)),
      members: manages
        ? a.members.map((m) => ({
            userId: m.userId,
            name: m.user.name,
            email: m.user.email,
            role: m.role as AcademyMemberRole,
          }))
        : [],
      storage: manages
        ? {
            usedBytes: await this.usedBytes(id),
            quotaBytes: a.storageQuotaMb * MB,
            vaultUsedBytes: await this.usedBytes(id, 'VAULT'),
            vaultQuotaBytes: a.vaultQuotaMb * MB,
          }
        : null,
      plan: manages ? planOf(a.planExpiresAt) : null,
      createdAt: a.createdAt.toISOString(),
    };
  }

  // --- Plan Director (SUPER_ADMIN) ------------------------------------------------

  /** Todas las academias con su plan y su uso (Admin → Academias). */
  async adminList(): Promise<AcademyAdminRowDto[]> {
    const rows = await this.prisma.academy.findMany({
      select: {
        id: true,
        name: true,
        city: true,
        commune: true,
        storageQuotaMb: true,
        vaultQuotaMb: true,
        planExpiresAt: true,
        createdAt: true,
        members: { where: { role: 'OWNER' }, select: { user: { select: { name: true, email: true } } }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });
    const sums = await this.prisma.academyVideo.groupBy({
      by: ['academyId', 'location'],
      _sum: { sizeBytes: true },
    });
    const used = (id: string, location: AcademyMediaLocation) =>
      Number(sums.find((x) => x.academyId === id && x.location === location)?._sum.sizeBytes ?? 0);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      commune: r.commune,
      ownerName: r.members[0]?.user.name ?? null,
      ownerEmail: r.members[0]?.user.email ?? null,
      plan: planOf(r.planExpiresAt),
      storage: {
        usedBytes: used(r.id, 'GALLERY'),
        quotaBytes: r.storageQuotaMb * MB,
        vaultUsedBytes: used(r.id, 'VAULT'),
        vaultQuotaBytes: r.vaultQuotaMb * MB,
      },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Activa, extiende o quita el Plan Director y ajusta los cupos (en GB). */
  async setPlan(id: string, dto: SetAcademyPlanDto): Promise<AcademyAdminRowDto> {
    const exists = await this.prisma.academy.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Academia no encontrada.');
    const data: Prisma.AcademyUpdateInput = {};
    if (dto.expiresAt !== undefined) {
      // Fecha sola (YYYY-MM-DD) = vigente hasta el final de ese día, hora de Chile.
      data.planExpiresAt = dto.expiresAt === null ? null : new Date(`${dto.expiresAt}T23:59:59-04:00`);
    }
    if (dto.storageQuotaGb !== undefined) data.storageQuotaMb = dto.storageQuotaGb * GB_MB;
    if (dto.vaultQuotaGb !== undefined) data.vaultQuotaMb = dto.vaultQuotaGb * GB_MB;
    await this.prisma.academy.update({ where: { id }, data });
    const row = (await this.adminList()).find((r) => r.id === id);
    if (!row) throw new NotFoundException('Academia no encontrada.');
    return row;
  }

  /**
   * Bytes ocupados en la galería (los que se están subiendo también cuentan) o en
   * la bóveda: cada una tiene su propio cupo.
   */
  async usedBytes(academyId: string, location: AcademyMediaLocation = 'GALLERY'): Promise<number> {
    const agg = await this.prisma.academyVideo.aggregate({
      where: { academyId, location },
      _sum: { sizeBytes: true },
    });
    return Number(agg._sum.sizeBytes ?? 0);
  }

  async quotaBytes(academyId: string, location: AcademyMediaLocation = 'GALLERY'): Promise<number> {
    const a = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { storageQuotaMb: true, vaultQuotaMb: true },
    });
    if (!a) throw new NotFoundException('Academia no encontrada.');
    return (location === 'VAULT' ? a.vaultQuotaMb : a.storageQuotaMb) * MB;
  }

  /** Cuenta por correo (404 con un mensaje claro si no existe). */
  private async userByEmail(email: string): Promise<{ id: string }> {
    const u = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
    if (!u) {
      throw new NotFoundException('No hay ninguna cuenta con ese correo. La persona debe registrarse primero en Nectason.');
    }
    return u;
  }

  /** Por ahora solo el SUPER_ADMIN crea academias; el director puede ser otra cuenta. */
  async create(user: AuthUser, dto: CreateAcademyDto, logo: UploadedImage | null): Promise<AcademyDto> {
    const director = dto.directorEmail?.trim() ? await this.userByEmail(dto.directorEmail) : { id: user.id };
    const a = await this.prisma.academy.create({
      data: {
        ...(this.toData(dto) as Prisma.AcademyCreateInput),
        name: dto.name.trim(),
        region: dto.region,
        logoData: logo ? logo.buffer.toString('base64') : null,
        logoMime: logo ? logo.mime : null,
        members: { create: { userId: director.id, role: 'OWNER' } },
      },
      select: { id: true },
    });
    return this.findOne(user, a.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateAcademyDto): Promise<AcademyDto> {
    await this.assertMember(user, id);
    const current = await this.prisma.academy.findUnique({
      where: { id },
      select: { region: true, city: true, commune: true },
    });
    await this.prisma.academy.update({ where: { id }, data: this.toData(dto, current) });
    return this.findOne(user, id);
  }

  async getLogo(id: string): Promise<UploadedImage | null> {
    const a = await this.prisma.academy.findUnique({ where: { id }, select: { logoData: true, logoMime: true } });
    if (!a?.logoData || !a.logoMime) return null;
    return { buffer: Buffer.from(a.logoData, 'base64'), mime: a.logoMime };
  }

  async setLogo(user: AuthUser, id: string, logo: UploadedImage | null): Promise<AcademyDto> {
    await this.assertMember(user, id);
    await this.prisma.academy.update({
      where: { id },
      data: { logoData: logo ? logo.buffer.toString('base64') : null, logoMime: logo ? logo.mime : null },
    });
    return this.findOne(user, id);
  }

  /** Borra la academia con sus clases y videos (también los archivos del storage). */
  async remove(user: AuthUser, id: string): Promise<void> {
    await this.assertOwner(user, id);
    const videos = await this.prisma.academyVideo.findMany({
      where: { academyId: id },
      select: { storageKey: true, thumbKey: true, pendingThumbKey: true, compatKey: true },
    });
    await this.prisma.academy.delete({ where: { id } });
    for (const v of videos) {
      for (const key of [v.storageKey, v.thumbKey, v.pendingThumbKey, v.compatKey]) {
        if (key) await this.media.remove(key);
      }
    }
  }

  /**
   * Cambia el director (SUPER_ADMIN). El anterior queda como profesor, para no
   * perder el acceso de golpe (se le puede quitar después).
   */
  async setDirector(id: string, dto: SetDirectorDto): Promise<AcademyAdminRowDto> {
    const exists = await this.prisma.academy.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Academia no encontrada.');
    const target = await this.userByEmail(dto.email);
    await this.prisma.$transaction([
      this.prisma.academyMember.updateMany({
        where: { academyId: id, role: 'OWNER', userId: { not: target.id } },
        data: { role: 'TEACHER' },
      }),
      this.prisma.academyMember.upsert({
        where: { academyId_userId: { academyId: id, userId: target.id } },
        create: { academyId: id, userId: target.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      }),
    ]);
    const row = (await this.adminList()).find((r) => r.id === id);
    if (!row) throw new NotFoundException('Academia no encontrada.');
    return row;
  }

  // --- profesores ---------------------------------------------------------------

  async addMember(user: AuthUser, id: string, dto: AddMemberDto): Promise<AcademyDto> {
    await this.assertOwner(user, id);
    const target = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException(
        'No hay ninguna cuenta con ese correo. El profesor debe registrarse primero en Nectason.',
      );
    }
    const exists = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId: id, userId: target.id } },
    });
    if (exists) throw new ConflictException('Esa persona ya administra la academia.');
    await this.prisma.academyMember.create({ data: { academyId: id, userId: target.id, role: 'TEACHER' } });
    return this.findOne(user, id);
  }

  async removeMember(user: AuthUser, id: string, userId: string): Promise<AcademyDto> {
    await this.assertOwner(user, id);
    const m = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId: id, userId } },
    });
    if (!m) throw new NotFoundException('Esa persona no es profesor de la academia.');
    if (m.role === 'OWNER') throw new BadRequestException('No se puede quitar al dueño de la academia.');
    await this.prisma.academyMember.delete({ where: { id: m.id } });
    return this.findOne(user, id);
  }

  // --- clases -------------------------------------------------------------------

  private classData(dto: UpdateClassDto): Prisma.AcademyClassUncheckedUpdateInput {
    const data: Prisma.AcademyClassUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.style !== undefined) data.style = dto.style;
    if (dto.level !== undefined) data.level = dto.level;
    if (dto.weekday !== undefined) data.weekday = dto.weekday;
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.durationMin !== undefined) data.durationMin = dto.durationMin;
    if (dto.teacherName !== undefined) data.teacherName = text(dto.teacherName);
    if (dto.place !== undefined) data.place = text(dto.place);
    if (dto.priceInfo !== undefined) data.priceInfo = text(dto.priceInfo);
    if (dto.description !== undefined) data.description = text(dto.description);
    if (dto.active !== undefined) data.active = dto.active;
    return data;
  }

  async createClass(user: AuthUser, academyId: string, dto: CreateClassDto): Promise<AcademyClassDto> {
    await this.assertMember(user, academyId);
    const c = await this.prisma.academyClass.create({
      data: {
        ...(this.classData(dto) as Prisma.AcademyClassUncheckedCreateInput),
        academyId,
        title: dto.title.trim(),
        weekday: dto.weekday,
        startTime: dto.startTime,
      },
    });
    return this.toClass(c);
  }

  /** Valida que la clase sea de la academia (404 si no). */
  async assertClass(academyId: string, classId: string): Promise<ClassRow> {
    const c = await this.prisma.academyClass.findFirst({ where: { id: classId, academyId } });
    if (!c) throw new NotFoundException('Clase no encontrada.');
    return c;
  }

  async updateClass(
    user: AuthUser,
    academyId: string,
    classId: string,
    dto: UpdateClassDto,
  ): Promise<AcademyClassDto> {
    await this.assertMember(user, academyId);
    await this.assertClass(academyId, classId);
    const c = await this.prisma.academyClass.update({ where: { id: classId }, data: this.classData(dto) });
    return this.toClass(c);
  }

  /** Los videos de la clase quedan como contenido general (classId = null). */
  async removeClass(user: AuthUser, academyId: string, classId: string): Promise<void> {
    await this.assertMember(user, academyId);
    await this.assertClass(academyId, classId);
    await this.prisma.academyClass.delete({ where: { id: classId } });
  }
}
