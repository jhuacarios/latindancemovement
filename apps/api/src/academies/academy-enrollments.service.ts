import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  publicName,
  type AcademyEnrollmentDto,
  type AcademyEnrollmentStatus,
  type MyEnrollmentDto,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import type { AuthUser } from '../auth/auth.types';
import { AcademiesService } from './academies.service';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const when = (c: { weekday: number; startTime: string }) => `${WEEKDAYS[c.weekday]} ${c.startTime}`;

/**
 * Inscripción a clases por solicitud. El alumno pide (con un mensaje opcional) y
 * el director acepta o rechaza; si la clase tiene cupo y está llena, la solicitud
 * queda pendiente (en espera). Aceptado = aparece en la lista de la clase, ve sus
 * videos y entra a su chat. Los avisos van por el chat 1 a 1 alumno ↔ director.
 */
@Injectable()
export class AcademyEnrollmentsService {
  private readonly logger = new Logger(AcademyEnrollmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly academies: AcademiesService,
    private readonly chat: ChatService,
  ) {}

  private async klass(academyId: string, classId: string) {
    const c = await this.prisma.academyClass.findFirst({
      where: { id: classId, academyId },
      select: {
        id: true,
        title: true,
        weekday: true,
        startTime: true,
        active: true,
        capacity: true,
        chatId: true,
        academy: { select: { id: true, name: true } },
      },
    });
    if (!c) throw new NotFoundException('Clase no encontrada.');
    return c;
  }

  /** Avisos por chat: nunca deben cortar la acción principal. */
  private async notify(from: string | null, to: string | null, body: string): Promise<void> {
    if (!from || !to) return;
    try {
      await this.chat.notifyDirect(from, to, body);
    } catch (e) {
      this.logger.warn(`No se pudo avisar por el chat: ${(e as Error).message}`);
    }
  }

  // --- alumno -----------------------------------------------------------------

  async request(user: AuthUser, academyId: string, classId: string, message?: string | null): Promise<void> {
    const c = await this.klass(academyId, classId);
    if (!c.active) throw new BadRequestException('Esta clase no está recibiendo alumnos.');
    // El SUPER_ADMIN puede inscribirse igual (para probar el flujo completo), aunque administre.
    if (user.role !== 'SUPER_ADMIN' && (await this.academies.roleIn(user, academyId))) {
      throw new BadRequestException('Eres parte de la academia: no necesitas inscribirte.');
    }
    const existing = await this.prisma.academyEnrollment.findUnique({
      where: { classId_userId: { classId, userId: user.id } },
      select: { status: true },
    });
    if (existing?.status === 'ACCEPTED') throw new ConflictException('Ya estás inscrito en esta clase.');
    if (existing?.status === 'PENDING') throw new ConflictException('Tu solicitud ya está enviada.');
    const msg = message?.trim() || null;
    await this.prisma.academyEnrollment.upsert({
      where: { classId_userId: { classId, userId: user.id } },
      create: { classId, userId: user.id, message: msg },
      update: { status: 'PENDING', message: msg, decidedAt: null },
    });
    const director = await this.academies.ownerId(academyId);
    await this.notify(
      user.id,
      director,
      `📝 Solicitud de inscripción a "${c.title}" (${when(c)}) en ${c.academy.name}.` +
        (msg ? `\n\n${msg}` : '') +
        '\n\nPuedes aceptarla o rechazarla en la academia → Solicitudes.',
    );
  }

  /** El alumno cancela su solicitud o deja la clase. */
  async cancel(user: AuthUser, academyId: string, classId: string): Promise<void> {
    const c = await this.klass(academyId, classId);
    const e = await this.prisma.academyEnrollment.findUnique({
      where: { classId_userId: { classId, userId: user.id } },
      select: { id: true },
    });
    if (!e) return;
    await this.prisma.academyEnrollment.delete({ where: { id: e.id } });
    if (c.chatId) await this.chat.removeParticipant(c.chatId, user.id);
  }

  async mine(user: AuthUser): Promise<MyEnrollmentDto[]> {
    const rows = await this.prisma.academyEnrollment.findMany({
      where: { userId: user.id, status: { in: ['PENDING', 'ACCEPTED'] } },
      select: {
        id: true,
        status: true,
        class: {
          select: {
            id: true,
            title: true,
            weekday: true,
            startTime: true,
            chatId: true,
            academy: { select: { id: true, name: true, logoMime: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      academyId: r.class.academy.id,
      academyName: r.class.academy.name,
      academyHasLogo: Boolean(r.class.academy.logoMime),
      classId: r.class.id,
      classTitle: r.class.title,
      weekday: r.class.weekday,
      startTime: r.class.startTime,
      status: r.status as AcademyEnrollmentStatus,
      chatId: r.status === 'ACCEPTED' ? r.class.chatId : null,
    }));
  }

  // --- director ---------------------------------------------------------------

  async list(user: AuthUser, academyId: string, status?: AcademyEnrollmentStatus): Promise<AcademyEnrollmentDto[]> {
    await this.academies.assertOwner(user, academyId);
    const rows = await this.prisma.academyEnrollment.findMany({
      where: { class: { academyId }, ...(status ? { status } : {}) },
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        decidedAt: true,
        userId: true,
        user: { select: { name: true, displayName: true, instagramHandle: true } },
        class: { select: { id: true, title: true, weekday: true, startTime: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      classId: r.class.id,
      classTitle: r.class.title,
      weekday: r.class.weekday,
      startTime: r.class.startTime,
      userId: r.userId,
      userName: publicName(r.user),
      instagramHandle: r.user.instagramHandle,
      status: r.status as AcademyEnrollmentStatus,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    }));
  }

  private async enrollment(academyId: string, enrollmentId: string) {
    const e = await this.prisma.academyEnrollment.findFirst({
      where: { id: enrollmentId, class: { academyId } },
      select: { id: true, status: true, userId: true, classId: true },
    });
    if (!e) throw new NotFoundException('Solicitud no encontrada.');
    return e;
  }

  async accept(user: AuthUser, academyId: string, enrollmentId: string): Promise<AcademyEnrollmentDto[]> {
    await this.academies.assertOwner(user, academyId);
    const e = await this.enrollment(academyId, enrollmentId);
    const c = await this.klass(academyId, e.classId);
    if (e.status !== 'ACCEPTED') {
      if (c.capacity !== null) {
        const taken = await this.prisma.academyEnrollment.count({ where: { classId: c.id, status: 'ACCEPTED' } });
        if (taken >= c.capacity) {
          throw new ConflictException(
            `La clase está llena (${taken}/${c.capacity}). Sube el cupo o libera un lugar para aceptar.`,
          );
        }
      }
      await this.prisma.academyEnrollment.update({
        where: { id: e.id },
        data: { status: 'ACCEPTED', decidedAt: new Date() },
      });
      const chatId = c.chatId ?? (await this.academies.ensureClassChat(c.id, user.id));
      await this.chat.addParticipant(chatId, e.userId);
      await this.notify(
        user.id,
        e.userId,
        `✅ ¡Quedaste inscrito en "${c.title}" (${when(c)}) en ${c.academy.name}! Ya puedes ver los videos de la clase y entrar a su chat.`,
      );
    }
    return this.list(user, academyId);
  }

  async reject(user: AuthUser, academyId: string, enrollmentId: string): Promise<AcademyEnrollmentDto[]> {
    await this.academies.assertOwner(user, academyId);
    const e = await this.enrollment(academyId, enrollmentId);
    if (e.status === 'ACCEPTED') {
      throw new BadRequestException('Este alumno ya está inscrito: para sacarlo de la clase usa "Quitar".');
    }
    const c = await this.klass(academyId, e.classId);
    await this.prisma.academyEnrollment.update({
      where: { id: e.id },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });
    await this.notify(user.id, e.userId, `Tu solicitud a "${c.title}" en ${c.academy.name} no fue aceptada esta vez.`);
    return this.list(user, academyId);
  }

  /** Saca a un alumno inscrito (sale del chat de la clase y deja de ver sus videos). */
  async remove(user: AuthUser, academyId: string, enrollmentId: string): Promise<AcademyEnrollmentDto[]> {
    await this.academies.assertOwner(user, academyId);
    const e = await this.enrollment(academyId, enrollmentId);
    const c = await this.klass(academyId, e.classId);
    await this.prisma.academyEnrollment.delete({ where: { id: e.id } });
    if (c.chatId) await this.chat.removeParticipant(c.chatId, e.userId);
    return this.list(user, academyId);
  }

  /** Si se suma un profesor a la academia, entra a los chats de clase que ya existan. */
  async syncStaff(academyId: string): Promise<void> {
    const classes = await this.prisma.academyClass.findMany({
      where: { academyId, chatId: { not: null } },
      select: { chatId: true },
    });
    const staff = await this.academies.staffIds(academyId);
    for (const c of classes) for (const s of staff) await this.chat.addParticipant(c.chatId!, s);
  }
}
