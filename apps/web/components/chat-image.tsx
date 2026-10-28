'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChatMessageDto } from '@baile-latino/types';
import { fetchMessageImage } from '@/lib/chat';
import { clsx } from '@/components/clsx';

/** Ancho máximo de la miniatura dentro de la burbuja. */
const THUMB_MAX_W = 320;
const THUMB_MAX_H = 360;

/**
 * Imagen de un mensaje. Se descarga con el token (un <img src> normal no puede)
 * y se muestra como object URL; click = ver a tamaño completo.
 */
export function ChatImage({ message }: { message: ChatMessageDto }) {
  const [open, setOpen] = useState(false);
  const { data: blob, isError } = useQuery({
    queryKey: ['chat', 'image', message.id],
    queryFn: () => fetchMessageImage(message.conversationId, message.id),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  // Reservar el espacio con las dimensiones reales para que no "salte" al cargar.
  const w = message.imageWidth ?? THUMB_MAX_W;
  const h = message.imageHeight ?? THUMB_MAX_H;
  const scale = Math.min(1, THUMB_MAX_W / w, THUMB_MAX_H / h);
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        style={{ width: tw, height: th, maxWidth: '100%' }}
        className={clsx(
          'block overflow-hidden rounded-xl bg-black/20',
          url ? 'cursor-zoom-in' : 'animate-pulse',
        )}
        aria-label="Ver imagen"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : isError ? (
          <span className="flex h-full w-full items-center justify-center text-xs text-red-300">
            No se pudo cargar
          </span>
        ) : null}
      </button>

      {open && url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-lg bg-neutral-800/80 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
          >
            ✕ Cerrar
          </button>
        </div>
      )}
    </>
  );
}
