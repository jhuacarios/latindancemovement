import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { DanceStyle, PublicUser, UserRole } from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  city: string | null;
  instagramHandle: string | null;
  styles: string;
  createdAt: Date;
  passwordHash?: string | null;
  googleId?: string | null;
};

function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as UserRole,
    city: u.city,
    instagramHandle: u.instagramHandle,
    styles: u.styles ? (u.styles.split(',').filter(Boolean) as DanceStyle[]) : [],
    createdAt: u.createdAt.toISOString(),
    hasPassword: Boolean(u.passwordHash),
    hasGoogle: Boolean(u.googleId),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toPublicUser);
  }

  async create(input: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    city?: string;
    styles?: DanceStyle[];
  }): Promise<PublicUser> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('El email ya está registrado');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: input.name,
        role: input.role,
        city: input.city ?? null,
        styles: (input.styles ?? []).join(','),
      },
    });
    return toPublicUser(user);
  }

  async update(
    id: string,
    data: { role?: UserRole; name?: string; city?: string },
  ): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: data.role, name: data.name, city: data.city },
    });
    return toPublicUser(updated);
  }

  async remove(id: string, currentUserId: string): Promise<{ id: string; deleted: true }> {
    if (id === currentUserId) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta.');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (user.role === 'SUPER_ADMIN') {
      const admins = await this.prisma.user.count({
        where: { role: 'SUPER_ADMIN' },
      });
      if (admins <= 1) {
        throw new ForbiddenException('No puedes eliminar al último SUPER_ADMIN.');
      }
    }

    // Limpieza de referencias antes de borrar (FKs sin cascada).
    await this.prisma.$transaction([
      // El catálogo creado por el usuario se reasigna al admin que elimina.
      this.prisma.track.updateMany({
        where: { createdById: id },
        data: { createdById: currentUserId },
      }),
      this.prisma.requestVote.deleteMany({ where: { userId: id } }),
      this.prisma.songRequest.deleteMany({ where: { requesterId: id } }),
      this.prisma.playlist.deleteMany({ where: { ownerId: id } }),
      // user.delete cascada: ownedTracks (personales), UserTrack, TrackTag.
      this.prisma.user.delete({ where: { id } }),
    ]);

    return { id, deleted: true };
  }
}
