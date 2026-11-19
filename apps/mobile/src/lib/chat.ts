import { useQuery } from '@tanstack/react-query';
import type {
  ChatConversationDto,
  ChatMessageDto,
  ChatMessagesPage,
  ChatUnreadResponse,
  ChatUser,
} from '@baile-latino/types';
import { API_BASE, api, authHeaders } from './api';
import { useAuth } from './auth';

/** Polling (sin WebSockets por ahora), igual que la web. */
export const POLL_UNREAD_MS = 15_000;
export const POLL_CONVERSATIONS_MS = 10_000;
export const POLL_THREAD_MS = 3_000;

export const chatKeys = {
  unread: ['chat', 'unread'] as const,
  conversations: ['chat', 'conversations'] as const,
  users: (q: string) => ['chat', 'users', q] as const,
};

export const chatApi = {
  users: (q: string) => api<ChatUser[]>(`/chat/users?q=${encodeURIComponent(q)}`),
  start: (userId: string) =>
    api<ChatConversationDto>('/chat/conversations', { method: 'POST', body: { userId } }),
  conversations: () => api<ChatConversationDto[]>('/chat/conversations'),
  messages: (id: string, before?: string) =>
    api<ChatMessagesPage>(`/chat/conversations/${id}/messages?limit=50${before ? `&before=${before}` : ''}`),
  since: (id: string, sinceId: string) =>
    api<ChatMessageDto[]>(`/chat/conversations/${id}/messages/since/${sinceId}`),
  send: (id: string, body: string) =>
    api<ChatMessageDto>(`/chat/conversations/${id}/messages`, { method: 'POST', body: { body } }),
  /** Foto ya achicada (JPEG) con texto opcional. */
  sendImage: (id: string, img: { uri: string; width: number; height: number }, body: string) => {
    const fd = new FormData();
    fd.append('body', body);
    fd.append('width', String(img.width));
    fd.append('height', String(img.height));
    // React Native acepta { uri, name, type } como archivo en FormData.
    fd.append('file', { uri: img.uri, name: 'foto.jpg', type: 'image/jpeg' } as unknown as Blob);
    return api<ChatMessageDto>(`/chat/conversations/${id}/messages/image`, { method: 'POST', form: fd });
  },
  markRead: (id: string) => api<void>(`/chat/conversations/${id}/read`, { method: 'POST' }),
};

/** La imagen de un mensaje se pide con sesión: fuente con el header de autorización. */
export function messageImageSource(conversationId: string, messageId: string) {
  return {
    uri: `${API_BASE}/chat/conversations/${conversationId}/messages/${messageId}/image`,
    headers: authHeaders(),
  };
}

/** Total de no leídos para el contador de la pestaña. */
export function useUnreadChat(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => api<ChatUnreadResponse>('/chat/unread'),
    enabled: Boolean(user),
    refetchInterval: POLL_UNREAD_MS,
  });
  return data?.total ?? 0;
}

// --- fechas (hora de Chile) -------------------------------------------------------
const TZ = 'America/Santiago';

export function formatMsgTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

export function formatDayLabel(iso: string): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return 'Hoy';
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return 'Ayer';
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(iso),
  );
}

export function formatListTime(iso: string): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return formatMsgTime(iso);
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return 'ayer';
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, day: 'numeric', month: 'short' })
    .format(new Date(iso))
    .replace('.', '');
}

/** Título y subtítulo de una conversación para la lista y la cabecera. */
export function conversationTitle(c: ChatConversationDto): { title: string; subtitle: string } {
  if (c.kind === 'CHANNEL' && c.channel) return { title: `# ${c.channel.name}`, subtitle: c.channel.placeName };
  if (c.kind === 'CLASS' && c.classGroup) {
    return { title: c.classGroup.title, subtitle: `Clase · ${c.classGroup.academyName}` };
  }
  return { title: c.other?.name ?? '—', subtitle: '' };
}

/** Vista previa del último mensaje (en grupos, con quién lo escribió). */
export function preview(c: ChatConversationDto): string {
  if (!c.lastMessage) return 'Sin mensajes todavía';
  const text = c.lastMessage.body || (c.lastMessage.hasImage ? '📷 Foto' : '');
  return c.kind === 'DIRECT' ? text : `${c.lastMessage.senderName}: ${text}`;
}
