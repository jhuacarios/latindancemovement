'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, Track } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Input, Spinner, StyleBadge } from './ui';
import { TrackThumb } from './track-thumb';

/**
 * Panel lateral de "Mis Canciones": busca en la biblioteca del usuario y permite
 * arrastrar canciones hacia la playlist que se está editando.
 */
export function LibraryDrawer({
  excludeTrackIds,
  onClose,
  onItemDragStart,
  onItemDragEnd,
}: {
  /** Canciones ya en la playlist (se excluyen de la lista). */
  excludeTrackIds: Set<string>;
  onClose: () => void;
  onItemDragStart: (trackId: string) => void;
  onItemDragEnd: () => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['library-drawer', debounced],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: '50', sort: 'recent' });
      if (debounced) p.set('search', debounced);
      return api<Paginated<Track>>(`/music/library?${p.toString()}`);
    },
  });

  const items = useMemo(
    () => (data?.data ?? []).filter((t) => !excludeTrackIds.has(t.id)),
    [data, excludeTrackIds],
  );

  return (
    <aside className="sticky top-0 flex max-h-[calc(100vh-7rem)] w-80 shrink-0 flex-col rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h3 className="text-sm font-semibold">🎵 Mis Canciones</h3>
        <button
          onClick={onClose}
          title="Cerrar"
          className="rounded-md bg-neutral-800 px-2 py-0.5 text-sm hover:bg-neutral-700"
        >
          ✕
        </button>
      </div>

      <div className="border-b border-neutral-800 p-2">
        <Input
          placeholder="Buscar en mis canciones…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="mt-1 px-1 text-[11px] text-neutral-500">
          Arrastra una canción a la playlist para agregarla.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && <Spinner />}
        {!isLoading && items.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-neutral-500">
            {debounced
              ? 'Sin resultados.'
              : 'No hay canciones disponibles para agregar.'}
          </p>
        )}
        <div className="flex flex-col gap-1">
          {items.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={() => onItemDragStart(t.id)}
              onDragEnd={onItemDragEnd}
              className="flex cursor-grab select-none items-center gap-2 rounded-lg border border-transparent p-1.5 transition hover:border-neutral-700 hover:bg-neutral-800/60 active:cursor-grabbing"
            >
              <span className="shrink-0">
                <TrackThumb track={t} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{t.title}</div>
                <div className="truncate text-[11px] text-neutral-500">
                  {t.artist}
                </div>
              </div>
              <StyleBadge style={t.style} />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
