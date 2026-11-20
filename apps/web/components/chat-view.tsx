'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { placeLabel } from '@baile-latino/types';
import type { ChatConversationDto, ChatUser } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  POLL_CONVERSATIONS_MS,
  chatKeys,
  formatListTime,
  listConversations,
  messagePreview,
  searchChatUsers,
  startConversation,
} from '@/lib/chat';
import { useDebounced } from '@/lib/use-debounce';
import { clsx } from '@/components/clsx';
import { ChannelAvatar } from '@/components/channel-avatar';
import { ClassAvatar } from '@/components/class-avatar';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { ChatThread } from '@/components/chat-thread';
import { UserAvatar } from '@/components/user-avatar';

/** Modal "Nuevo chat": buscador de usuarios por nombre o Instagram. */
function NewChatModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (u: ChatUser) => void;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data, isLoading } = useQuery({
    queryKey: chatKeys.users(dq),
    queryFn: () => searchChatUsers(dq),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">💬 Nuevo chat</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o @instagram…"
        />
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {isLoading && <Spinner label="Buscando…" />}
          {data && data.length === 0 && (
            <div className="py-6 text-center text-sm text-neutral-500">
              Nadie con ese nombre.
            </div>
          )}
          {data?.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onPick(u)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-neutral-800"
            >
              <UserAvatar user={{ ...u, displayName: null }} className="h-9 w-9 shrink-0 text-sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{u.name}</div>
                <div className="truncate text-xs text-neutral-500">
                  {u.role}
                  {u.city ? ` · ${placeLabel(u.city, u.commune)}` : ''}
                  {u.instagramHandle ? ` · @${u.instagramHandle}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConversationRow({
  c,
  active,
  onClick,
}: {
  c: ChatConversationDto;
  active: boolean;
  onClick: () => void;
}) {
  const isChannel = c.kind === 'CHANNEL' && c.channel;
  const cls = c.kind === 'CLASS' ? c.classGroup : null;
  const title = isChannel ? `# ${c.channel!.name}` : cls ? cls.title : (c.other?.name ?? '—');
  const text = c.lastMessage
    ? messagePreview(c.lastMessage)
    : 'Sin mensajes todavía';
  // En los canales, quién escribió el último mensaje.
  const preview =
    (isChannel || cls) && c.lastMessage ? `${c.lastMessage.senderName}: ${text}` : text;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition',
        active ? 'bg-brand/10' : 'hover:bg-neutral-800/70',
      )}
    >
      {cls ? (
        <ClassAvatar academyId={cls.academyId} />
      ) : isChannel ? (
        <ChannelAvatar channel={c.channel!} />
      ) : c.other ? (
        <UserAvatar user={{ ...c.other, displayName: null }} className="h-10 w-10 shrink-0 text-sm" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
          {title.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div
            className={clsx(
              'truncate text-sm',
              c.unreadCount > 0 ? 'font-semibold text-neutral-100' : 'font-medium',
            )}
          >
            {title}
            {cls && (
              <span className="ml-1.5 text-xs font-normal text-neutral-500">Clase · {cls.academyName}</span>
            )}
            {isChannel && (
              <span className="ml-1.5 text-xs font-normal text-neutral-500">
                {c.channel!.placeName}
              </span>
            )}
          </div>
          {c.lastMessageAt && (
            <div className="shrink-0 text-[11px] text-neutral-500">
              {formatListTime(c.lastMessageAt)}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div
            className={clsx(
              'truncate text-xs',
              c.unreadCount > 0 ? 'text-neutral-200' : 'text-neutral-500',
            )}
          >
            {preview}
          </div>
          {c.unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {c.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

type InboxItem =
  | { kind: 'direct'; c: ChatConversationDto }
  | { kind: 'community'; placeId: string; channels: ChatConversationDto[] };

/**
 * Agrupa los canales por comunidad (como las comunidades de WhatsApp): cada social
 * aparece una vez, en la posición de su canal con actividad más reciente, con sus
 * canales debajo (General primero). Solo vienen los canales donde el usuario
 * participa, así que no se muestra nada a lo que no tenga acceso.
 */
function groupInbox(list: ChatConversationDto[]): InboxItem[] {
  const items: InboxItem[] = [];
  const groups = new Map<string, Extract<InboxItem, { kind: 'community' }>>();
  for (const c of list) {
    if (c.kind === 'CHANNEL' && c.channel) {
      const g = groups.get(c.channel.placeId);
      if (g) g.channels.push(c);
      else {
        const ng = { kind: 'community' as const, placeId: c.channel.placeId, channels: [c] };
        groups.set(c.channel.placeId, ng);
        items.push(ng);
      }
    } else {
      items.push({ kind: 'direct', c });
    }
  }
  for (const g of groups.values()) {
    g.channels.sort((a, b) => Number(b.channel!.isGeneral) - Number(a.channel!.isGeneral));
  }
  return items;
}

/** Cabecera de una comunidad + sus canales como sub-filas. */
function CommunityGroup({
  channels,
  activeId,
  onOpen,
}: {
  channels: ChatConversationDto[];
  activeId?: string;
  onOpen: (id: string) => void;
}) {
  const info = channels[0].channel!;
  const containsActive = channels.some((c) => c.id === activeId);
  const [open, setOpen] = useState(true);
  const unread = channels.reduce((n, c) => n + c.unreadCount, 0);
  const lastAt = channels
    .map((c) => c.lastMessageAt)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);
  const expanded = open || containsActive;

  return (
    <div className="border-b border-neutral-800/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-800/70"
      >
        <ChannelAvatar channel={info} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className={clsx('truncate text-sm', unread > 0 ? 'font-semibold text-neutral-100' : 'font-medium')}>
              {info.placeName}
            </div>
            {lastAt && <div className="shrink-0 text-[11px] text-neutral-500">{formatListTime(lastAt)}</div>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-xs text-neutral-500">
              Comunidad · {channels.length} {channels.length === 1 ? 'canal' : 'canales'}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!expanded && unread > 0 && (
                <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unread}
                </span>
              )}
              <span aria-hidden className={clsx('text-[10px] text-neutral-500 transition-transform', expanded && 'rotate-90')}>
                ▶
              </span>
            </div>
          </div>
        </div>
      </button>
      {expanded &&
        channels.map((c) => {
          const text = c.lastMessage
            ? messagePreview(c.lastMessage)
            : 'Sin mensajes todavía';
          const preview = c.lastMessage ? `${c.lastMessage.senderName}: ${text}` : text;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c.id)}
              className={clsx(
                'flex w-full items-center gap-2 py-2 pl-9 pr-3 text-left transition',
                c.id === activeId ? 'bg-brand/10' : 'hover:bg-neutral-800/70',
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-xs font-bold text-amber-300">
                #
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className={clsx('truncate text-sm', c.unreadCount > 0 ? 'font-semibold text-neutral-100' : 'text-neutral-300')}>
                    {c.channel!.name}
                  </div>
                  {c.lastMessageAt && (
                    <div className="shrink-0 text-[11px] text-neutral-500">{formatListTime(c.lastMessageAt)}</div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className={clsx('truncate text-xs', c.unreadCount > 0 ? 'text-neutral-200' : 'text-neutral-500')}>
                    {preview}
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
    </div>
  );
}

/**
 * Vista de mensajes: lista de conversaciones a la izquierda y el hilo activo a
 * la derecha. En móvil se muestra una u otra.
 */
export function ChatView({ activeId }: { activeId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [newChat, setNewChat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: conversations, isLoading } = useQuery({
    queryKey: chatKeys.conversations,
    queryFn: listConversations,
    refetchInterval: POLL_CONVERSATIONS_MS,
    refetchIntervalInBackground: false,
  });

  const active = conversations?.find((c) => c.id === activeId) ?? null;

  const open = (id: string) => router.push(`/chat/${id}`);

  const pick = async (u: ChatUser) => {
    setNewChat(false);
    try {
      const c = await startConversation(u.id);
      // Que la lista ya la incluya antes de navegar (si no, "no encontrada" un instante).
      await qc.invalidateQueries({ queryKey: chatKeys.conversations });
      open(c.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo abrir el chat.');
    }
  };

  const showListOnMobile = !activeId;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[420px] flex-col lg:h-[calc(100vh-6.5rem)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">💬 Mensajes</h1>
          <p className="hidden text-sm text-neutral-400 sm:block">
            Chats directos y los canales de tus comunidades. El historial se guarda para siempre.
          </p>
        </div>
        <Button type="button" onClick={() => setNewChat(true)}>
          + Nuevo chat
        </Button>
      </div>

      {error && <Card className="mb-3 text-sm text-red-300">{error}</Card>}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
        {/* Lista */}
        <aside
          className={clsx(
            'w-full shrink-0 flex-col overflow-y-auto border-neutral-800 lg:flex lg:w-80 lg:border-r',
            showListOnMobile ? 'flex' : 'hidden',
          )}
        >
          {isLoading && (
            <div className="p-3">
              <Spinner label="Cargando chats…" />
            </div>
          )}
          {conversations && conversations.length === 0 && (
            <div className="p-4 text-sm text-neutral-500">
              Aún no tienes conversaciones. Parte una con «Nuevo chat».
            </div>
          )}
          {conversations &&
            groupInbox(conversations).map((it) =>
              it.kind === 'community' ? (
                <CommunityGroup
                  key={`place-${it.placeId}`}
                  channels={it.channels}
                  activeId={activeId}
                  onOpen={open}
                />
              ) : (
                <ConversationRow
                  key={it.c.id}
                  c={it.c}
                  active={it.c.id === activeId}
                  onClick={() => open(it.c.id)}
                />
              ),
            )}
        </aside>

        {/* Hilo */}
        <section
          className={clsx(
            'min-w-0 flex-1 flex-col lg:flex',
            showListOnMobile ? 'hidden' : 'flex',
          )}
        >
          {active ? (
            <ChatThread
              key={active.id}
              conversation={active}
              onBack={() => router.push('/chat')}
            />
          ) : activeId && isLoading ? (
            <div className="p-4">
              <Spinner />
            </div>
          ) : activeId ? (
            <div className="p-4 text-sm text-neutral-500">Conversación no encontrada.</div>
          ) : (
            <div className="hidden flex-1 items-center justify-center p-6 text-center text-sm text-neutral-500 lg:flex">
              Elige una conversación o inicia una nueva.
            </div>
          )}
        </section>
      </div>

      {newChat && <NewChatModal onClose={() => setNewChat(false)} onPick={pick} />}
    </div>
  );
}
