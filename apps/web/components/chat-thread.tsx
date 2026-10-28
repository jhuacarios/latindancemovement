'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatConversationDto, ChatMessageDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  POLL_THREAD_MS,
  chatKeys,
  dayKey,
  formatDayLabel,
  formatMsgTime,
  listMessages,
  listMessagesSince,
  markConversationRead,
  sendImageMessage,
  sendMessage,
} from '@/lib/chat';
import { compressImage, type CompressedImage } from '@/lib/image-compress';
import { clsx } from '@/components/clsx';
import { Spinner } from '@/components/ui';
import { InstagramLink } from '@/components/instagram-link';
import { ChatImage } from '@/components/chat-image';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
/** Tope duro tras comprimir (el servidor también lo exige). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Ticks de estado de un mensaje propio: ✓ enviado, ✓✓ leído (resaltado). */
function Ticks({ read }: { read: boolean }) {
  return (
    <span
      className={clsx('inline-flex items-center', read ? 'text-sky-200' : 'text-white/70')}
      title={read ? 'Leído' : 'Enviado'}
      aria-label={read ? 'Leído' : 'Enviado'}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12.5l4.5 4.5L18 7.5" />
      </svg>
      {read && (
        <svg viewBox="0 0 24 24" className="-ml-2 h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12.5l4.5 4.5L18 7.5" />
        </svg>
      )}
    </span>
  );
}

/** Hilo de una conversación: historial, polling de nuevos, envío y ticks de leído. */
export function ChatThread({
  conversation,
  onBack,
}: {
  conversation: ChatConversationDto;
  /** En móvil: volver a la lista. */
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const convId = conversation.id;

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Imagen pendiente de enviar (ya comprimida) y su preview. */
  const [pending, setPending] = useState<CompressedImage | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);

  const scrollToBottom = (smooth = false) =>
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });

  const refreshLists = useCallback(() => {
    void qc.invalidateQueries({ queryKey: chatKeys.conversations });
    void qc.invalidateQueries({ queryKey: chatKeys.unread });
  }, [qc]);

  // Carga inicial (últimos 50) + marcar leído.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessages([]);
    setNextCursor(null);
    setError(null);
    stickToBottom.current = true;
    listMessages(convId)
      .then((page) => {
        if (!alive) return;
        setMessages(page.messages);
        setNextCursor(page.nextCursor);
        setLoading(false);
        void markConversationRead(convId).then(refreshLists);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar el chat.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [convId, refreshLists]);

  // Al llegar mensajes, bajar si el usuario estaba al final.
  useEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [messages]);

  // Polling de mensajes nuevos desde el último conocido.
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const last = messages[messages.length - 1];
      if (!last) {
        // Conversación vacía: releer la primera página por si el otro escribió.
        const page = await listMessages(convId).catch(() => null);
        if (page && page.messages.length) {
          setMessages(page.messages);
          setNextCursor(page.nextCursor);
          void markConversationRead(convId).then(refreshLists);
        }
        return;
      }
      const fresh = await listMessagesSince(convId, last.id).catch(() => []);
      if (fresh.length) {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...fresh.filter((m) => !known.has(m.id))];
        });
        if (fresh.some((m) => m.senderId !== user?.id)) {
          void markConversationRead(convId).then(refreshLists);
        }
      }
    }, POLL_THREAD_MS);
    return () => clearInterval(timer);
  }, [convId, loading, messages, user?.id, refreshLists]);

  useEffect(() => {
    if (!pending) {
      setPendingUrl(null);
      return;
    }
    const u = URL.createObjectURL(pending.file);
    setPendingUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [pending]);

  /** Prepara (comprime) una imagen elegida, pegada o arrastrada. */
  const attach = async (f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Solo se pueden adjuntar imágenes.');
      return;
    }
    setPreparing(true);
    setError(null);
    try {
      const c = await compressImage(f);
      if (c.file.size > MAX_IMAGE_BYTES) {
        setError('La imagen es demasiado grande incluso comprimida (máx. 5 MB).');
        return;
      }
      setPending(c);
      inputRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la imagen.');
    } finally {
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    void attach(item.getAsFile());
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const page = await listMessages(convId, nextCursor);
      stickToBottom.current = false;
      setMessages((prev) => [...page.messages, ...prev]);
      setNextCursor(page.nextCursor);
      // Mantener la posición visual tras insertar arriba.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending) || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = pending
        ? await sendImageMessage(convId, pending.file, body, pending.width, pending.height)
        : await sendMessage(convId, body);
      setText('');
      setPending(null);
      stickToBottom.current = true;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      refreshLists();
      inputRef.current?.focus();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const other = conversation.other;
  // Leído si el otro marcó lectura después de que se envió el mensaje.
  const otherReadAt = conversation.otherReadAt;
  const isRead = (m: ChatMessageDto) => Boolean(otherReadAt && otherReadAt >= m.createdAt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabecera */}
      <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-2.5 lg:px-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 lg:hidden"
            aria-label="Volver"
          >
            ←
          </button>
        )}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
          {other.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{other.name}</div>
          <div className="truncate text-xs text-neutral-500">
            {other.role}
            {other.city ? ` · ${other.city}` : ''}
          </div>
        </div>
        {other.instagramHandle && (
          <InstagramLink handle={other.instagramHandle} size="sm" />
        )}
      </div>

      {/* Mensajes */}
      <div
        ref={listRef}
        onScroll={onScroll}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void attach(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          'relative flex-1 space-y-1 overflow-y-auto px-3 py-3 lg:px-4',
          dragOver && 'ring-2 ring-inset ring-brand',
        )}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/70 text-sm font-medium text-brand">
            Suelta la imagen para adjuntarla
          </div>
        )}
        {loading && <Spinner label="Cargando historial…" />}
        {!loading && nextCursor && (
          <div className="pb-2 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
            >
              {loadingMore ? 'Cargando…' : 'Ver mensajes anteriores'}
            </button>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="py-10 text-center text-sm text-neutral-500">
            Todavía no hay mensajes. ¡Rompe el hielo!
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === user?.id;
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  {formatDayLabel(m.createdAt)}
                </div>
              )}
              <div className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={clsx(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm lg:max-w-[65%]',
                    mine
                      ? 'rounded-br-md bg-brand text-white'
                      : 'rounded-bl-md bg-neutral-800 text-neutral-100',
                  )}
                >
                  {m.hasImage && (
                    <div className={clsx(m.body && 'mb-1.5')}>
                      <ChatImage message={m} />
                    </div>
                  )}
                  {m.body && (
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  )}
                  <div
                    className={clsx(
                      'mt-0.5 flex items-center justify-end gap-1 text-[10px]',
                      mine ? 'text-white/70' : 'text-neutral-500',
                    )}
                  >
                    {formatMsgTime(m.createdAt)}
                    {mine && <Ticks read={isRead(m)} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        className="border-t border-neutral-800 p-2 lg:p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {error && <div className="mb-1 text-xs text-red-300">{error}</div>}
        {(pendingUrl || preparing) && (
          <div className="mb-2 flex items-center gap-3">
            {pendingUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pendingUrl}
                alt="Imagen a enviar"
                className="h-20 max-w-[160px] rounded-lg border border-neutral-700 object-cover"
              />
            ) : (
              <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-neutral-700 text-xs text-neutral-400">
                Preparando…
              </div>
            )}
            {pending && (
              <div className="text-xs text-neutral-400">
                {pending.width}×{pending.height} · {Math.round(pending.file.size / 1024)} KB
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="ml-3 text-red-300 hover:underline"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={sending || preparing}
            title="Adjuntar imagen (o pega una captura con Ctrl+V)"
            aria-label="Adjuntar imagen"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-700 text-lg text-neutral-300 transition hover:border-neutral-500 hover:text-white disabled:opacity-50"
          >
            📎
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void attach(e.target.files?.[0])}
          />
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={pending ? 'Agrega un texto (opcional)…' : `Escríbele a ${other.name}…`}
            className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || preparing || (!text.trim() && !pending)}
            className="h-10 shrink-0 rounded-xl bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
