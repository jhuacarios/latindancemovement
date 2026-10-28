import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { readMultipart } from '../common/multipart';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ChatService } from './chat.service';
import {
  ListMessagesDto,
  SearchUsersDto,
  SendMessageDto,
  StartConversationDto,
} from './dto/chat.dto';

/** Mensajes directos 1 a 1 entre usuarios. Todo requiere sesión. */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Usuarios con quienes iniciar un chat (buscador). */
  @Get('users')
  users(@CurrentUser() me: AuthUser, @Query() q: SearchUsersDto) {
    return this.chat.searchUsers(me, q.q);
  }

  /** Total de no leídos (badge del menú). */
  @Get('unread')
  async unread(@CurrentUser() me: AuthUser) {
    return { total: await this.chat.unreadTotal(me) };
  }

  @Get('conversations')
  conversations(@CurrentUser() me: AuthUser) {
    return this.chat.listConversations(me);
  }

  /** Abre (o retoma) la conversación con un usuario. */
  @Post('conversations')
  start(@CurrentUser() me: AuthUser, @Body() dto: StartConversationDto) {
    return this.chat.startConversation(me, dto.userId);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query() q: ListMessagesDto,
  ) {
    return this.chat.listMessages(me, id, q.before, q.limit);
  }

  /** Mensajes posteriores a `sinceId` (polling del hilo abierto). */
  @Get('conversations/:id/messages/since/:sinceId')
  since(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('sinceId') sinceId: string,
  ) {
    return this.chat.listMessagesSince(me, id, sinceId);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.sendMessage(me, id, dto.body);
  }

  /**
   * Envía un mensaje con imagen. multipart: `file` (imagen, máx. 5 MB) +
   * `body` (texto opcional) + `width`/`height` (px, informativos para el layout).
   */
  @Post('conversations/:id/messages/image')
  async sendImage(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    const { file, fields } = await readMultipart(req);
    if (!file) throw new BadRequestException('Falta la imagen.');
    const dim = (v?: string) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };
    return this.chat.sendMessage(me, id, fields.body ?? '', {
      ...file,
      width: dim(fields.width),
      height: dim(fields.height),
    });
  }

  /** Imagen de un mensaje (requiere sesión y ser participante). */
  @Get('conversations/:id/messages/:mid/image')
  async image(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('mid') mid: string,
    @Res() reply: FastifyReply,
  ) {
    const f = await this.chat.getImage(me, id, mid);
    if (!f) {
      reply.code(404).send({ message: 'Este mensaje no tiene imagen.' });
      return;
    }
    reply
      .header('Content-Type', f.mime)
      .header('Cache-Control', 'private, max-age=86400')
      .send(f.buffer);
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  async read(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.chat.markRead(me, id);
  }
}
