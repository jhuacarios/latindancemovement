import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CHAT_REACTIONS, publicName, STICKER_DELETED } from '@baile-latino/types';
import type {
  ChatChannelInfo,
  ChatConversationDto,
  ChatMessageDto,
  ChatMessagesPage,
  ChatReactionChanges,
  ChatReactionSummary,
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
  avatarAt: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/** Campos de un mensaje en listas: sin `imageData` (base64, pesado; se sirve aparte). */
const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  imageMime: true,
  stickerId: true,
  imageWidth: true,
  imageHeight: true,
  createdAt: true,
  sender: { select: { name: true, displayName: true, avatarAt: true } },
  reactions: {
    select: { userId: true, emoji: true, user: { select: { name: true, displayName: true } } },
    orderBy: { createdAt: 'asc' },
  },
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
      avatarAt: u.avatarAt ? u.avatarAt.toISOString() : null,
    };
  }

  /** Reacciones agrupadas por emoji, la más usada primero. */
  private summarize(rows: MessageRow['reactions'], meId: string): ChatReactionSummary[] {
    const by = new Map<string, ChatReactionSummary>();
    for (const r of rows) {
      const s = by.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
      s.count++;
      if (r.userId === meId) s.mine = true;
      if (s.names.length < 10) s.names.push(publicName(r.user));
      by.set(r.emoji, s);
    }
    // Más usada primero; si empatan, en el orden de la fila de emojis (❤️ 😂 🔥 👏 💃 😮).
    const rank = (e: string) => (CHAT_REACTIONS as readonly string[]).indexOf(e);
    return [...by.values()].sort((x, y) => y.count - x.count || rank(x.emoji) - rank(y.emoji));
  }

  private toMessage(m: MessageRow, meId: string): ChatMessageDto {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderName: publicName(m.sender),
      senderAvatarAt: m.sender.avatarAt ? m.sender.avatarAt.toISOString() : null,
      body: m.body,
      hasImage: Boolean(m.imageMime),
      imageWidth: m.imageWidth,
      imageHeight: m.imageHeight,
      reactions: this.summarize(m.reactions, meId),
      // Sin texto, sin imagen y sin sticker = era un sticker que se borró.
      stickerId: m.stickerId ?? (!m.body && !m.imageMime ? STICKER_DELETED : null),
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
        academyId: true,
        classId: true,
        description: true,
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
    const directIds = rows.filter((r) => r.kind === 'DIRECT').map((r) => r.id);
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
      if (r.kind === 'CLASS') {
        if (!r.academyId || !r.classId) return [];
        return [
          {
            id: r.id,
            kind: 'CLASS',
            other: null,
            channel: null,
            classGroup: {
              academyId: r.academyId,
              academyName: r.description ?? 'Academia',
              classId: r.classId,
              title: r.name ?? 'Clase',
              memberCount: r._count.participants,
            },
            lastMessage: last ? this.toMessage(last, me.id) : null,
            lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
            unreadCount: unread.get(r.id) ?? 0,
            otherReadAt: null,
            createdAt: r.createdAt.toISOString(),
          },
        ];
      }
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
            classGroup: null,
            lastMessage: last ? this.toMessage(last, me.id) : null,
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
          classGroup: null,
          other: this.toUser(otherP.user),
          lastMessage: last ? this.toMessage(last, me.id) : null,
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
    if (p) return;
    // El SUPER_ADMIN entra a cualquier grupo (canal o clase) y queda como participante;
    // los chats 1 a 1 siguen siendo privados.
    if (me.role === 'SUPER_ADMIN') {
      const c = await this.prisma.chatConversation.findUnique({ where: { id: conversationId }, select: { kind: true } });
      if (c && c.kind !== 'DIRECT') {
        await this.addParticipant(conversationId, me.id);
        return;
      }
    }
    throw new ForbiddenException('No participas en esta conversación.');
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
      messages: page.map((m) => this.toMessage(m, me.id)),
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
    return rows.map((m) => this.toMessage(m, me.id));
  }

  async sendMessage(
    me: AuthUser,
    conversationId: string,
    body: string,
    image?: (UploadedImage & { width: number | null; height: number | null }) | null,
    stickerId?: string | null,
  ): Promise<ChatMessageDto> {
    await this.assertMember(me, conversationId);
    const text = body.trim();
    if (!text && !image && !stickerId) throw new BadRequestException('El mensaje está vacío.');
    if (stickerId) {
      // Los stickers son públicos: basta con que exista.
      const s = await this.prisma.sticker.findUnique({ where: { id: stickerId }, select: { id: true } });
      if (!s) throw new NotFoundException('Ese sticker ya no existe.');
    }
    const now = new Date();
    const [msg] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          conversationId,
          senderId: me.id,
          body: stickerId ? '' : text,
          createdAt: now,
          ...(stickerId ? { stickerId } : {}),
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
    return this.toMessage(msg, me.id);
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

  // --- Chat de una clase de academia (lo usa AcademiesModule) ---------------------

  /** El grupo de la clase; lo crea si no existe. `academyName` se guarda para mostrarlo. */
  async ensureClassGroup(input: {
    academyId: string;
    academyName: string;
    classId: string;
    title: string;
    createdById?: string;
  }): Promise<string> {
    const found = await this.prisma.chatConversation.findFirst({
      where: { kind: 'CLASS', classId: input.classId },
      select: { id: true },
    });
    if (found) return found.id;
    const c = await this.prisma.chatConversation.create({
      data: {
        kind: 'CLASS',
        academyId: input.academyId,
        classId: input.classId,
        name: input.title,
        description: input.academyName,
        createdById: input.createdById,
      },
      select: { id: true },
    });
    return c.id;
  }

  /** Renombra el grupo de la clase (al cambiar el título de la clase o la academia). */
  async renameClassGroup(classId: string, data: { title?: string; academyName?: string }): Promise<void> {
    await this.prisma.chatConversation.updateMany({
      where: { kind: 'CLASS', classId },
      data: {
        ...(data.title !== undefined ? { name: data.title } : {}),
        ...(data.academyName !== undefined ? { description: data.academyName } : {}),
      },
    });
  }

  /** Actualiza el nombre de la academia en todos sus grupos de clase. */
  async renameAcademyGroups(academyId: string, academyName: string): Promise<void> {
    await this.prisma.chatConversation.updateMany({
      where: { kind: 'CLASS', academyId },
      data: { description: academyName },
    });
  }

  /** Borra el grupo de la clase con sus mensajes (al borrar la clase). */
  async deleteClassGroup(classId: string): Promise<void> {
    await this.prisma.chatConversation.deleteMany({ where: { kind: 'CLASS', classId } });
  }

  /**
   * Mensaje automático de `fromUserId` a `toUserId` por el chat 1 a 1 (lo abre si
   * no existe). Se usa para avisar solicitudes de inscripción y sus respuestas.
   */
  async notifyDirect(fromUserId: string, toUserId: string, body: string): Promise<void> {
    if (fromUserId === toUserId) return;
    const me = { id: fromUserId } as AuthUser;
    const conv = await this.startConversation(me, toUserId);
    await this.sendMessage(me, conv.id, body);
  }

  /** Borra el canal con sus mensajes (cascade). */
  async deleteChannel(conversationId: string): Promise<void> {
    await this.prisma.chatConversation.delete({ where: { id: conversationId } });
  }

  // --- Reacciones ----------------------------------------------------------------

  /** Pone, cambia o quita (emoji null o el mismo que ya tenía) mi reacción a un mensaje. */
  async react(
    me: AuthUser,
    conversationId: string,
    messageId: string,
    emoji: string | null,
  ): Promise<ChatReactionSummary[]> {
    await this.assertMember(me, conversationId);
    const msg = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true },
    });
    if (!msg) throw new NotFoundException('Mensaje no encontrado.');
    const key = { messageId_userId: { messageId, userId: me.id } };
    const current = await this.prisma.chatReaction.findUnique({ where: key, select: { emoji: true } });
    if (!emoji || current?.emoji === emoji) {
      await this.prisma.chatReaction.deleteMany({ where: { messageId, userId: me.id } });
    } else {
      await this.prisma.chatReaction.upsert({
        where: key,
        create: { messageId, userId: me.id, emoji },
        update: { emoji, createdAt: new Date() },
      });
    }
    await this.prisma.chatMessage.update({ where: { id: messageId }, data: { reactionsAt: new Date() } });
    const rows = await this.prisma.chatReaction.findMany({
      where: { messageId },
      select: MESSAGE_SELECT.reactions.select,
      orderBy: { createdAt: 'asc' },
    });
    return this.summarize(rows, me.id);
  }

  /** Mensajes cuyas reacciones cambiaron después de `since` (polling del hilo abierto). */
  async reactionChanges(me: AuthUser, conversationId: string, since?: string): Promise<ChatReactionChanges> {
    await this.assertMember(me, conversationId);
    const now = new Date();
    const from = since ? new Date(since) : null;
    if (!from || Number.isNaN(from.getTime())) return { now: now.toISOString(), changes: [] };
    // 2 s de margen: una reacción guardada justo durante la consulta anterior no se pierde.
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId, reactionsAt: { gt: new Date(from.getTime() - 2000) } },
      select: { id: true, reactions: MESSAGE_SELECT.reactions },
      take: 200,
    });
    return {
      now: now.toISOString(),
      changes: rows.map((r) => ({ messageId: r.id, reactions: this.summarize(r.reactions, me.id) })),
    };
  }

  async markRead(me: AuthUser, conversationId: string): Promise<void> {
    await this.assertMember(me, conversationId);
    await this.prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      data: { lastReadAt: new Date() },
    });
  }
}
