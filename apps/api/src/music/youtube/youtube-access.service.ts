import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  YoutubeAccessRequest,
  YoutubeAccessStatus,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';

type RequestRow = {
  id: string;
  userId: string;
  email: string;
  status: string;
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  user?: { name: string; email: string } | null;
};

/**
 * Gestiona las solicitudes de acceso a YouTube. Solo registran la intención del
 * usuario y el estado; agregar el correo como test user en Google sigue siendo
 * un paso manual del admin (Google no expone API para eso).
 */
@Injectable()
export class YoutubeAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(r: RequestRow): YoutubeAccessRequest {
    return {
      id: r.id,
      userId: r.userId,
      email: r.email,
      status: r.status as YoutubeAccessStatus,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      userName: r.user?.name,
      userLoginEmail: r.user?.email,
    };
  }

  /** Crea o actualiza la solicitud del usuario (una por usuario). */
  async requestAccess(
    userId: string,
    email: string,
  ): Promise<YoutubeAccessRequest> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new BadRequestException('Ingresa un correo de Google válido.');
    }
    // Volver a solicitar actualiza el correo y la deja pendiente de nuevo.
    const row = await this.prisma.youtubeAccessRequest.upsert({
      where: { userId },
      create: { userId, email: normalized },
      update: { email: normalized, status: 'PENDING', reviewedAt: null },
    });
    return this.toPublic(row);
  }

  /** Solicitud del usuario actual (o null si no pidió). */
  async myRequest(userId: string): Promise<YoutubeAccessRequest | null> {
    const row = await this.prisma.youtubeAccessRequest.findUnique({
      where: { userId },
    });
    return row ? this.toPublic(row) : null;
  }

  /** Todas las solicitudes (para el admin), pendientes primero, luego recientes. */
  async listAll(): Promise<YoutubeAccessRequest[]> {
    const rows = await this.prisma.youtubeAccessRequest.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const order: Record<string, number> = { PENDING: 0, ADDED: 1, REJECTED: 2 };
    return rows
      .map((r) => this.toPublic(r))
      .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }

  /** El admin cambia el estado tras (o en vez de) agregar el correo en Google. */
  async setStatus(
    id: string,
    status: YoutubeAccessStatus,
  ): Promise<YoutubeAccessRequest> {
    const row = await this.prisma.youtubeAccessRequest.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
      include: { user: { select: { name: true, email: true } } },
    });
    return this.toPublic(row);
  }
}
