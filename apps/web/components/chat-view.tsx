'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatConversationDto, ChatUser } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import {
  POLL_CONVERSATIONS_MS,
  chatKeys,
  formatListTime,
  listConversations,
  searchChatUsers,
  startConversation,
} from '@/lib/chat';
import { useDebounced } from '@/lib/use-debounce';
import { clsx } from '@/components/clsx';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { ChatThread } from '@/components/chat-thread';

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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
                {u.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{u.name}</div>
                <div className="truncate text-xs text-neutral-500">
                  {u.role}
                  {u.city ? ` · ${u.city}` : ''}
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
  const preview = c.lastMessage
    ? c.lastMessage.body || (c.lastMessage.hasImage ? '📷 Foto' : '')
    : 'Sin mensajes todavía';
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition',
        active ? 'bg-brand/10' : 'hover:bg-neutral-800/70',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
        {c.other.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div
            className={clsx(
              'truncate text-sm',
              c.unreadCount > 0 ? 'font-semibold text-neutral-100' : 'font-medium',
            )}
          >
            {c.other.name}
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
            Chat directo con otros miembros. El historial se guarda para siempre.
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
          {conversations?.map((c) => (
            <ConversationRow
              key={c.id}
              c={c}
              active={c.id === activeId}
              onClick={() => open(c.id)}
            />
          ))}
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
