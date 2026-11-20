'use client';

import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { GifSearchResponse } from '@baile-latino/types';
import { api } from '@/lib/api';

const searchGifs = (q: string, offset: number) =>
  api<GifSearchResponse>(`/gifs?offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`);

/** Botón "GIF" del chat: buscador de GIPHY. No aparece si la API no tiene clave. */
export function GifButton({ onSend, disabled }: { onSend: (gifId: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // ¿Están activados? (la primera página de "lo del momento"; la API la guarda en caché)
  const probe = useQuery({ queryKey: ['gifs', 'probe'], queryFn: () => searchGifs('', 0), staleTime: 30 * 60_000 });
  const list = useInfiniteQuery({
    queryKey: ['gifs', q],
    queryFn: ({ pageParam }) => searchGifs(q, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: open,
    staleTime: 10 * 60_000,
  });

  // Buscar al dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!probe.data?.enabled) return null;
  const gifs = list.data?.pages.flatMap((p) => p.gifs) ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title="GIFs"
        aria-label="GIFs"
        className="flex h-10 shrink-0 items-center justify-center rounded-xl border border-neutral-700 px-2 text-xs font-bold text-neutral-300 transition hover:border-neutral-500 hover:text-white disabled:opacity-50"
      >
        GIF
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 flex w-80 flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
          <div className="p-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Buscar GIFs (ej: baile, salsa, aplausos)"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-brand"
            />
          </div>
          <div
            className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto px-2"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 120 && list.hasNextPage && !list.isFetchingNextPage) {
                void list.fetchNextPage();
              }
            }}
          >
            {gifs.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSend(g.id);
                }}
                className="overflow-hidden rounded-md bg-neutral-800 hover:opacity-80"
                title={g.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.previewUrl} alt={g.title} loading="lazy" className="h-28 w-full object-cover" />
              </button>
            ))}
            {list.isLoading && <p className="col-span-2 p-3 text-sm text-neutral-500">Buscando…</p>}
            {list.isError && <p className="col-span-2 p-3 text-sm text-red-300">{(list.error as Error).message}</p>}
            {!list.isLoading && gifs.length === 0 && !list.isError && (
              <p className="col-span-2 p-3 text-sm text-neutral-500">No encontramos GIFs con eso.</p>
            )}
          </div>
          <div className="border-t border-neutral-800 px-2 py-1 text-right text-[10px] text-neutral-500">Powered by GIPHY</div>
        </div>
      )}
    </div>
  );
}
