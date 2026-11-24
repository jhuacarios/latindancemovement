import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CommunityDto } from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import type { AuthUser } from '../auth/auth.types';

/** Por ahora solo los sociales al aire libre tienen comunidad. */
const KINDS_WITH_COMMUNITY = ['OUTDOOR_SOCIAL'];
const GENERAL_NAME = 'General';

/**
 * Comunidad de un lugar, como las comunidades de WhatsApp: miembros + canales.
 * Los canales son conversaciones del chat (ChatService); acá vive la membresía
 * y los permisos. Abierta: cualquiera con cuenta se une; al unirse entra al
 * General y elige a qué otros canales entrar. Los canales los crea el
 * administrador del lugar o el SUPER_ADMIN.
 */
@Injectable()
export class CommunityChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {
    // Fijar mensajes en los canales: el administrador del social (o SUPER_ADMIN).
    chat.registerModerator('CHANNEL', async (user, g) => Boolean(g.placeId) && this.canManagePlace(user, g.placeId!));
  }

  private async place(id: string): Promise<{ id: string; adminId: string | null }> {
    const p = await this.prisma.communityPlace.findUnique({
      where: { id },
      select: { id: true, kind: true, adminId: true },
    });
    if (!p) throw new NotFoundException('Lugar no encontrado.');
    if (!KINDS_WITH_COMMUNITY.includes(p.kind)) {
      throw new BadRequestException('Este lugar no tiene comunidad.');
    }
    return p;
  }

  private canManage(user: AuthUser, place: { adminId: string | null }): boolean {
    return user.role === 'SUPER_ADMIN' || place.adminId === user.id;
  }

  private async isMember(placeId: string, userId: string): Promise<boolean> {
    const m = await this.prisma.communityMember.findUnique({
      where: { placeId_userId: { placeId, userId } },
      select: { userId: true },
    });
    return Boolean(m);
  }

  // --- Para otros módulos (stickers) ---------------------------------------------

  /** Sociales de cuya comunidad es miembro el usuario (o que administra). */
  async placeIdsFor(userId: string): Promise<string[]> {
    const [member, admin] = await Promise.all([
      this.prisma.communityMember.findMany({ where: { userId }, select: { placeId: true } }),
      this.prisma.communityPlace.findMany({ where: { adminId: userId }, select: { id: true } }),
    ]);
    return [...new Set([...member.map((m) => m.placeId), ...admin.map((p) => p.id)])];
  }

  /** ¿Puede administrar el social (sus canales, stickers…)? 404 si no existe. */
  async canManagePlace(user: AuthUser, placeId: string): Promise<boolean> {
    const p = await this.prisma.communityPlace.findUnique({ where: { id: placeId }, select: { adminId: true } });
    if (!p) throw new NotFoundException('Lugar no encontrado.');
    return this.canManage(user, p);
  }

  /** Nombres de los sociales (para mostrar). */
  async placeNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.communityPlace.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** El General se crea la primera vez que hace falta. */
  private async ensureGeneral(placeId: string, createdById: string): Promise<string> {
    return (
      (await this.chat.findGeneralChannelId(placeId)) ??
      this.chat.createChannel({ placeId, name: GENERAL_NAME, isGeneral: true, createdById })
    );
  }

  /** Canal de este lugar, o 404. */
  private async channelOf(placeId: string, channelId: string) {
    const c = await this.chat.getChannel(channelId);
    if (!c || c.placeId !== placeId) throw new NotFoundException('Canal no encontrado.');
    return c;
  }

  async get(user: AuthUser, placeId: string): Promise<CommunityDto> {
    const place = await this.place(placeId);
    const [isMember, memberCount, channels] = await Promise.all([
      this.isMember(placeId, user.id),
      this.prisma.communityMember.count({ where: { placeId } }),
      this.chat.listPlaceChannels(placeId, user.id),
    ]);
    return {
      placeId,
      isMember,
      memberCount,
      canManage: this.canManage(user, place),
      channels,
    };
  }

  async join(user: AuthUser, placeId: string): Promise<CommunityDto> {
    await this.place(placeId);
    await this.prisma.communityMember.upsert({
      where: { placeId_userId: { placeId, userId: user.id } },
      update: {},
      create: { placeId, userId: user.id },
    });
    const general = await this.ensureGeneral(placeId, user.id);
    await this.chat.addParticipant(general, user.id);
    return this.get(user, placeId);
  }

  async leave(user: AuthUser, placeId: string): Promise<CommunityDto> {
    await this.place(placeId);
    await this.chat.removeFromPlaceChannels(placeId, user.id);
    await this.prisma.communityMember.deleteMany({ where: { placeId, userId: user.id } });
    return this.get(user, placeId);
  }

  async createChannel(
    user: AuthUser,
    placeId: string,
    input: { name: string; description?: string | null },
  ): Promise<CommunityDto> {
    const place = await this.place(placeId);
    if (!this.canManage(user, place)) {
      throw new ForbiddenException('Solo el administrador de la comunidad crea canales.');
    }
    const name = input.name.trim().replace(/^#/, '');
    if (name.length < 2) throw new BadRequestException('Ponle un nombre al canal.');
    if (name.toLowerCase() === GENERAL_NAME.toLowerCase()) {
      throw new BadRequestException('Ya existe el canal General.');
    }
    // Quien lo crea queda en la comunidad y en el canal.
    await this.prisma.communityMember.upsert({
      where: { placeId_userId: { placeId, userId: user.id } },
      update: {},
      create: { placeId, userId: user.id },
    });
    await this.chat.addParticipant(await this.ensureGeneral(placeId, user.id), user.id);
    const id = await this.chat.createChannel({
      placeId,
      name,
      description: input.description?.trim() || null,
      createdById: user.id,
    });
    await this.chat.addParticipant(id, user.id);
    return this.get(user, placeId);
  }

  async updateChannel(
    user: AuthUser,
    placeId: string,
    channelId: string,
    input: { name?: string; description?: string | null },
  ): Promise<CommunityDto> {
    const place = await this.place(placeId);
    if (!this.canManage(user, place)) {
      throw new ForbiddenException('Solo el administrador de la comunidad edita canales.');
    }
    const c = await this.channelOf(placeId, channelId);
    const data: { name?: string; description?: string | null } = {};
    if (input.name !== undefined) {
      if (c.isGeneral) throw new BadRequestException('El canal General no se renombra.');
      const name = input.name.trim().replace(/^#/, '');
      if (name.length < 2) throw new BadRequestException('Ponle un nombre al canal.');
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    await this.chat.updateChannel(channelId, data);
    return this.get(user, placeId);
  }

  async deleteChannel(user: AuthUser, placeId: string, channelId: string): Promise<CommunityDto> {
    const place = await this.place(placeId);
    if (!this.canManage(user, place)) {
      throw new ForbiddenException('Solo el administrador de la comunidad borra canales.');
    }
    const c = await this.channelOf(placeId, channelId);
    if (c.isGeneral) throw new BadRequestException('El canal General no se puede borrar.');
    await this.chat.deleteChannel(channelId);
    return this.get(user, placeId);
  }

  async joinChannel(user: AuthUser, placeId: string, channelId: string): Promise<CommunityDto> {
    await this.place(placeId);
    await this.channelOf(placeId, channelId);
    if (!(await this.isMember(placeId, user.id))) {
      throw new ForbiddenException('Primero únete a la comunidad.');
    }
    await this.chat.addParticipant(channelId, user.id);
    return this.get(user, placeId);
  }

  async leaveChannel(user: AuthUser, placeId: string, channelId: string): Promise<CommunityDto> {
    await this.place(placeId);
    const c = await this.channelOf(placeId, channelId);
    if (c.isGeneral) {
      throw new BadRequestException('Para salir del General, sal de la comunidad.');
    }
    await this.chat.removeParticipant(channelId, user.id);
    return this.get(user, placeId);
  }
}
