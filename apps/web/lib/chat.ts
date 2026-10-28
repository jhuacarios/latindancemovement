import { useQuery } from '@tanstack/react-query';
import type {
  ChatConversationDto,
  ChatMessageDto,
  ChatMessagesPage,
  ChatUnreadResponse,
  ChatUser,
} from '@baile-latino/types';
import { api, fetchProtectedBlob, uploadForm } from './api';
import { useAuth } from './auth';

/** Cada cuánto se refresca cada cosa (polling; sin WebSockets por ahora). */
export const POLL_UNREAD_MS = 15_000;
export const POLL_CONVERSATIONS_MS = 10_000;
export const POLL_THREAD_MS = 3_000;

export const chatKeys = {
  unread: ['chat', 'unread'] as const,
  conversations: ['chat', 'conversations'] as const,
  users: (q: string) => ['chat', 'users', q] as const,
};

export function searchChatUsers(q: string) {
  return api<ChatUser[]>(`/chat/users?q=${encodeURIComponent(q)}`);
}

export function startConversation(userId: string) {
  return api<ChatConversationDto>('/chat/conversations', {
    method: 'POST',
    body: { userId },
  });
}

export function listConversations() {
  return api<ChatConversationDto[]>('/chat/conversations');
}

export function listMessages(conversationId: string, before?: string, limit = 50) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (before) qs.set('before', before);
  return api<ChatMessagesPage>(`/chat/conversations/${conversationId}/messages?${qs}`);
}

export function listMessagesSince(conversationId: string, sinceId: string) {
  return api<ChatMessageDto[]>(
    `/chat/conversations/${conversationId}/messages/since/${sinceId}`,
  );
}

export function sendMessage(conversationId: string, body: string) {
  return api<ChatMessageDto>(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { body },
  });
}

/** Envía una imagen (ya comprimida en el cliente) con texto opcional. */
export function sendImageMessage(
  conversationId: string,
  image: File,
  body: string,
  width: number,
  height: number,
) {
  const fd = new FormData();
  fd.append('body', body);
  fd.append('width', String(width));
  fd.append('height', String(height));
  fd.append('file', image);
  return uploadForm<ChatMessageDto>(
    `/chat/conversations/${conversationId}/messages/image`,
    fd,
  );
}

export function fetchMessageImage(conversationId: string, messageId: string) {
  return fetchProtectedBlob(`/chat/conversations/${conversationId}/messages/${messageId}/image`);
}

export function markConversationRead(conversationId: string) {
  return api<void>(`/chat/conversations/${conversationId}/read`, { method: 'POST' });
}

/** Total de no leídos, refrescado en segundo plano (badge del menú). */
export function useUnreadChat(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => api<ChatUnreadResponse>('/chat/unread'),
    enabled: Boolean(user),
    refetchInterval: POLL_UNREAD_MS,
    refetchIntervalInBackground: false,
  });
  return data?.total ?? 0;
}

const TZ = 'America/Santiago';

/** "14:05" */
export function formatMsgTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** Clave de día (para separadores) en hora de Chile. */
export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** "Hoy" / "Ayer" / "jueves 10 de septiembre". */
export function formatDayLabel(iso: string): string {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return 'Hoy';
  if (key === yesterday) return 'Ayer';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

/** Para la lista: hora si es hoy, "ayer", o "12 sep". */
export function formatListTime(iso: string): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return formatMsgTime(iso);
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return 'ayer';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(iso))
    .replace('.', '');
}
