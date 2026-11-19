import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { publicName } from '@baile-latino/types';
import type {
  ChatChannelInfo,
  ChatConversationDto,
  ChatMessageDto,
  ChatMessagesPage,
  ChatUser,
  UserRole,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { UploadedImage } from '../common/multipart';

const USER_SELECT = {
  id: true,
  name: true,
  displayName: true,
  role: true,
  city: true,
  commune: true,
  instagramHandle: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/** Campos de un mensaje en listas: sin `imageData` (base64, pesado; se sirve aparte). */
const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  imageMime: true,
  imageWidth: true,
  imageHeight: true,
  createdAt: true,
  sender: { select: { name: true, displayName: true } },
} satisfies Prisma.ChatMessageSelect;

type MessageRow = Prisma.ChatMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

const DEFAULT_PAGE = 50;

/** Clave única de la pareja, independiente de quién inició. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private toUser(u: UserRow): ChatUser {
    return {
      id: u.id,
      name: publicName(u),
      role: u.role as UserRole,
      city: u.city,
      commune: u.commune,
      instagramHandle: u.instagramHandle,
    };
  }

  private toMessage(m: MessageRow): ChatMessageDto {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderName: publicName(m.sender),
      body: m.body,
      hasImage: Boolean(m.imageMime),
      imageWidth: m.imageWidth,
      imageHeight: m.imageHeight,
      createdAt: m.createdAt.toISOString(),
    };
  }

  /** Usuarios con quienes se puede chatear (todos menos uno mismo), por nombre. */
  async searchUsers(me: AuthUser, q?: string): Promise<ChatUser[]> {
    const term = q?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        id: { not: me.id },
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { displayName: { contains: term, mode: 'insensitive' } },
                { instagramHandle: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: USER_SELECT,
      orderBy: { name: 'asc' },
      take: 30,
    });
    return rows.map((u) => this.toUser(u));
  }

  /** Abre (o reutiliza) la conversación 1 a 1 con `userId`. */
  async startConversation(me: AuthUser, userId: string): Promise<ChatConversationDto> {
    if (userId === me.id) {
      throw new BadRequestException('No puedes abrir un chat contigo mismo.');
    }
    const other = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!other) throw new NotFoundException('Usuario no encontrado.');

    const key = pairKey(me.id, userId);
    const conv = await this.prisma.chatConversation.upsert({
      where: { pairKey: key },
      update: {},
      create: {
        pairKey: key,
        participants: { create: [{ userId: me.id }, { userId }] },
      },
      select: { id: true },
    });
    const list = await this.listConversations(me, conv.id);
    return list[0];
  }

  /**
   * Conversaciones del usuario, más recientes primero, con el otro participante,
   * último mensaje y no leídos. `onlyId` limita a una (para devolverla tras crear).
   */
  async listConversations(me: AuthUser, onlyId?: string): Promise<ChatConversationDto[]> {
    const rows = await this.prisma.chatConversation.findMany({
      where: {
        ...(onlyId ? { id: onlyId } : {}),
        participants: { some: { userId: me.id } },
      },
      select: {
        id: true,
        kind: true,
        name: true,
        isGeneral: true,
        placeId: true,
        place: { select: { name: true, photoMime: true, updatedAt: true } },
        _count: { select: { participants: true } },
        lastMessageAt: true,
        createdAt: true,
        // Solo mi fila: en un canal puede haber cientos de participantes.
        participants: {
          where: { userId: me.id },
          select: { userId: true, lastReadAt: true },
        },
        messages: {
          select: MESSAGE_SELECT,
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    // En los 1 a 1, el otro participante (una sola consulta para todos).
    const directIds = rows.filter((r) => r.kind !== 'CHANNEL').map((r) => r.id);
    const others = directIds.length
      ? await this.prisma.chatParticipant.findMany({
          where: { conversationId: { in: directIds }, userId: { not: me.id } },
          select: { conversationId: true, lastReadAt: true, user: { select: USER_SELECT } },
        })
      : [];
    const otherByConv = new Map(others.map((o) => [o.conversationId, o]));

    // No leídos: mensajes de otros posteriores a mi lastReadAt, por conversación.
    const mine = rows.map((r) => ({
      id: r.id,
      readAt: r.participants[0]?.lastReadAt ?? null,
    }));
    const unread = new Map<string, number>();
    await Promise.all(
      mine.map(async ({ id, readAt }) => {
        const n = await this.prisma.chatMessage.count({
          where: {
            conversationId: id,
            senderId: { not: me.id },
            ...(readAt ? { createdAt: { gt: readAt } } : {}),
          },
        });
        unread.set(id, n);
      }),
    );

    return rows.flatMap((r): ChatConversationDto[] => {
      const last = r.messages[0];
      if (r.kind === 'CHANNEL') {
        if (!r.placeId || !r.place) return [];
        const channel: ChatChannelInfo = {
          placeId: r.placeId,
          placeName: r.place.name,
          placeHasPhoto: Boolean(r.place.photoMime),
          placeUpdatedAt: r.place.updatedAt.toISOString(),
          name: r.name ?? 'Canal',
          isGeneral: r.isGeneral,
          memberCount: r._count.participants,
        };
        return [
          {
            id: r.id,
            kind: 'CHANNEL',
            other: null,
            channel,
            lastMessage: last ? this.toMessage(last) : null,
            lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
            unreadCount: unread.get(r.id) ?? 0,
            otherReadAt: null,
            createdAt: r.createdAt.toISOString(),
          },
        ];
      }
      const otherP = otherByConv.get(r.id);
      if (!otherP) return [];
      return [
        {
          id: r.id,
          kind: 'DIRECT',
          channel: null,
          other: this.toUser(otherP.user),
          lastMessage: last ? this.toMessage(last) : null,
          lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
          unreadCount: unread.get(r.id) ?? 0,
          otherReadAt: otherP.lastReadAt ? otherP.lastReadAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        },
      ];
    });
  }

  /** Total de mensajes no leídos en todas las conversaciones (badge del menú). */
  async unreadTotal(me: AuthUser): Promise<number> {
    const parts = await this.prisma.chatParticipant.findMany({
      where: { userId: me.id },
      select: { conversationId: true, lastReadAt: true },
    });
    if (parts.length === 0) return 0;
    const counts = await Promise.all(
      parts.map((p) =>
        this.prisma.chatMessage.count({
          where: {
            conversationId: p.conversationId,
            senderId: { not: me.id },
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        }),
      ),
    );
    return counts.reduce((a, b) => a + b, 0);
  }

  private async assertMember(me: AuthUser, conversationId: string): Promise<void> {
    const p = await this.prisma.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      select: { userId: true },
    });
    if (!p) throw new ForbiddenException('No participas en esta conversación.');
  }

  /**
   * Mensajes de una conversación, del más antiguo al más nuevo dentro de la
   * página. Sin `before` devuelve los últimos `limit`; con `before` (id) los
   * anteriores a ese mensaje, para cargar historial hacia atrás.
   */
  async listMessages(
    me: AuthUser,
    conversationId: string,
    before?: string,
    limit = DEFAULT_PAGE,
  ): Promise<ChatMessagesPage> {
    await this.assertMember(me, conversationId);
    let cursorDate: Date | undefined;
    if (before) {
      const anchor = await this.prisma.chatMessage.findFirst({
        where: { id: before, conversationId },
        select: { createdAt: true },
      });
      if (!anchor) throw new NotFoundException('Mensaje de referencia no encontrado.');
      cursorDate = anchor.createdAt;
    }
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return {
      messages: page.map((m) => this.toMessage(m)),
      nextCursor: hasMore && page.length ? page[0].id : null,
    };
  }

  /** Mensajes nuevos desde `sinceId` (exclusivo), para el polling del hilo abierto. */
  async listMessagesSince(
    me: AuthUser,
    conversationId: string,
    sinceId: string,
  ): Promise<ChatMessageDto[]> {
    await this.assertMember(me, conversationId);
    const anchor = await this.prisma.chatMessage.findFirst({
      where: { id: sinceId, conversationId },
      select: { createdAt: true },
    });
    if (!anchor) return [];
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId, createdAt: { gt: anchor.createdAt } },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map((m) => this.toMessage(m));
  }

  async sendMessage(
    me: AuthUser,
    conversationId: string,
    body: string,
    image?: (UploadedImage & { width: number | null; height: number | null }) | null,
  ): Promise<ChatMessageDto> {
    await this.assertMember(me, conversationId);
    const text = body.trim();
    if (!text && !image) throw new BadRequestException('El mensaje está vacío.');
    const now = new Date();
    const [msg] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          conversationId,
          senderId: me.id,
          body: text,
          createdAt: now,
          ...(image
            ? {
                imageData: image.buffer.toString('base64'),
                imageMime: image.mime,
                imageWidth: image.width,
                imageHeight: image.height,
              }
            : {}),
        },
        select: MESSAGE_SELECT,
      }),
      this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      // Enviar implica haber leído lo anterior.
      this.prisma.chatParticipant.update({
        where: { conversationId_userId: { conversationId, userId: me.id } },
        data: { lastReadAt: now },
      }),
    ]);
    return this.toMessage(msg);
  }

  /** Imagen de un mensaje (solo participantes). */
  async getImage(
    me: AuthUser,
    conversationId: string,
    messageId: string,
  ): Promise<UploadedImage | null> {
    await this.assertMember(me, conversationId);
    const m = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { imageData: true, imageMime: true },
    });
    if (!m?.imageData || !m.imageMime) return null;
    return { buffer: Buffer.from(m.imageData, 'base64'), mime: m.imageMime };
  }

  // --- Canales de comunidades (los usa CommunityModule; aquí no se validan permisos) ---

  async createChannel(input: {
    placeId: string;
    name: string;
    description?: string | null;
    isGeneral?: boolean;
    createdById: string;
  }): Promise<string> {
    const c = await this.prisma.chatConversation.create({
      data: {
        kind: 'CHANNEL',
        placeId: input.placeId,
        name: input.name,
        description: input.description ?? null,
        isGeneral: input.isGeneral ?? false,
        createdById: input.createdById,
      },
      select: { id: true },
    });
    return c.id;
  }

  async findGeneralChannelId(placeId: string): Promise<string | null> {
    const c = await this.prisma.chatConversation.findFirst({
      where: { kind: 'CHANNEL', placeId, isGeneral: true },
      select: { id: true },
    });
    return c?.id ?? null;
  }

  async getChannel(
    conversationId: string,
  ): Promise<{ id: string; placeId: string; isGeneral: boolean } | null> {
    const c = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, kind: 'CHANNEL' },
      select: { id: true, placeId: true, isGeneral: true },
    });
    return c?.placeId ? { id: c.id, placeId: c.placeId, isGeneral: c.isGeneral } : null;
  }

  /** Canales de un lugar con sus miembros, si `userId` está y sus no leídos. */
  async listPlaceChannels(
    placeId: string,
    userId: string,
  ): Promise<
    {
      id: string;
      name: string;
      description: string | null;
      isGeneral: boolean;
      memberCount: number;
      joined: boolean;
      unreadCount: number;
    }[]
  > {
    const rows = await this.prisma.chatConversation.findMany({
      where: { kind: 'CHANNEL', placeId },
      select: {
        id: true,
        name: true,
        description: true,
        isGeneral: true,
        _count: { select: { participants: true } },
        participants: { where: { userId }, select: { lastReadAt: true } },
      },
      orderBy: [{ isGeneral: 'desc' }, { name: 'asc' }],
    });
    return Promise.all(
      rows.map(async (r) => {
        const mine = r.participants[0];
        const unreadCount = mine
          ? await this.prisma.chatMessage.count({
              where: {
                conversationId: r.id,
                senderId: { not: userId },
                ...(mine.lastReadAt ? { createdAt: { gt: mine.lastReadAt } } : {}),
              },
            })
          : 0;
        return {
          id: r.id,
          name: r.name ?? 'Canal',
          description: r.description,
          isGeneral: r.isGeneral,
          memberCount: r._count.participants,
          joined: Boolean(mine),
          unreadCount,
        };
      }),
    );
  }

  /** Agrega a un canal. Lo anterior a su llegada no cuenta como no leído. */
  async addParticipant(conversationId: string, userId: string): Promise<void> {
    await this.prisma.chatParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: {},
      create: { conversationId, userId, lastReadAt: new Date() },
    });
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await this.prisma.chatParticipant.deleteMany({ where: { conversationId, userId } });
  }

  /** Saca al usuario de todos los canales de un lugar (al salir de la comunidad). */
  async removeFromPlaceChannels(placeId: string, userId: string): Promise<void> {
    await this.prisma.chatParticipant.deleteMany({
      where: { userId, conversation: { kind: 'CHANNEL', placeId } },
    });
  }

  async updateChannel(
    conversationId: string,
    data: { name?: string; description?: string | null },
  ): Promise<void> {
    await this.prisma.chatConversation.update({ where: { id: conversationId }, data });
  }

  /** Borra el canal con sus mensajes (cascade). */
  async deleteChannel(conversationId: string): Promise<void> {
    await this.prisma.chatConversation.delete({ where: { id: conversationId } });
  }

  async markRead(me: AuthUser, conversationId: string): Promise<void> {
    await this.assertMember(me, conversationId);
    await this.prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      data: { lastReadAt: new Date() },
    });
  }
}
