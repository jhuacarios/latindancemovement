'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { stickerKeys, stickersApi, stickerUrl } from '@/lib/stickers';
import { clsx } from '@/components/clsx';

/** Botón de stickers del chat: abre un panel con los packs que puedo usar. */
export function StickerButton({ onSend, disabled }: { onSend: (stickerId: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [packIdx, setPackIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: stickerKeys.available,
    queryFn: stickersApi.available,
    enabled: open,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const packs = q.data ?? [];
  const pack = packs[Math.min(packIdx, Math.max(0, packs.length - 1))];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title="Stickers"
        aria-label="Stickers"
        className="rounded-lg px-2 py-2 text-lg leading-none text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-50"
      >
        🩰
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-80 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
          {q.isLoading ? (
            <p className="p-4 text-sm text-neutral-500">Cargando…</p>
          ) : packs.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              Todavía no hay stickers. Las academias y los sociales pueden crear los suyos.
            </p>
          ) : (
            <>
              <div className="flex gap-1 overflow-x-auto border-b border-neutral-800 p-1.5">
                {packs.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPackIdx(i)}
                    className={clsx(
                      'shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs',
                      p.id === pack?.id ? 'bg-brand/20 text-brand' : 'text-neutral-400 hover:bg-neutral-800',
                    )}
                    title={p.ownerName ?? 'Nectason'}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="grid max-h-64 grid-cols-4 gap-1 overflow-y-auto p-2">
                {pack?.stickers.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSend(id);
                    }}
                    className="aspect-square rounded-lg p-1 transition hover:bg-neutral-800"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={stickerUrl(id)} alt="" className="h-full w-full object-contain" loading="lazy" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
