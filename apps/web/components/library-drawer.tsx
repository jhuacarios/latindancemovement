'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DanceStyle, Paginated, Tag, Track } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Input, Spinner, StyleBadge } from './ui';
import { TrackThumb } from './track-thumb';
import { usePlayer } from './player';
import { clsx } from './clsx';

/**
 * Panel lateral de "Mis Canciones": busca en la biblioteca del usuario y permite
 * arrastrar canciones hacia la playlist que se está editando.
 */
export function LibraryDrawer({
  excludeTrackIds,
  onClose,
  onItemDragStart,
  onItemDragEnd,
  onAddTrack,
}: {
  /** Canciones ya en la playlist (se excluyen de la lista). */
  excludeTrackIds: Set<string>;
  onClose: () => void;
  onItemDragStart: (trackId: string) => void;
  onItemDragEnd: () => void;
  /** Doble click en una canción: agregar al final de la playlist. */
  onAddTrack?: (trackId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [style, setStyle] = useState<DanceStyle | ''>('');
  const [substyles, setSubstyles] = useState<string[]>([]);
  const player = usePlayer();
  // Distingue click (reproducir) de doble click (agregar): el click espera un
  // pelín por si viene un segundo click.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Vocabulario de sub-estilos (para los tags activables del estilo elegido).
  const { data: vocab } = useQuery({
    queryKey: ['tags-vocab'],
    queryFn: () => api<Tag[]>('/music/tags'),
  });
  const substyleOptions = useMemo(
    () =>
      style
        ? (vocab ?? []).filter((t) => t.style === style).map((t) => t.name)
        : [],
    [vocab, style],
  );

  // Al cambiar de estilo, el mismo botón lo desactiva (vuelve a "todos").
  function selectStyle(s: DanceStyle) {
    setStyle((prev) => (prev === s ? '' : s));
    setSubstyles([]);
  }
  function toggleSubstyle(name: string) {
    setSubstyles((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  const { data, isLoading } = useQuery({
    queryKey: ['library-drawer', debounced, style, substyles],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: '50', sort: 'recent' });
      if (debounced) p.set('search', debounced);
      if (style) p.set('style', style);
      if (substyles.length) p.set('substyles', substyles.join(','));
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

        {/* Switch de estilo: bachata primero. Vuelve a "todos" al re-tocar. */}
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-neutral-800/60 p-0.5">
          {(['BACHATA', 'SALSA'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectStyle(s)}
              className={clsx(
                'rounded-md py-1 text-xs font-medium transition',
                style === s
                  ? 'bg-brand text-white'
                  : 'text-neutral-300 hover:bg-neutral-700/60',
              )}
            >
              {s === 'BACHATA' ? 'Bachata' : 'Salsa'}
            </button>
          ))}
        </div>

        {/* Tags de sub-estilos del estilo elegido (activables, multi). */}
        {style && (
          <div className="mt-2 flex flex-wrap gap-1">
            {substyleOptions.length === 0 && (
              <span className="text-[11px] text-neutral-500">
                Sin sub-estilos en el vocabulario.
              </span>
            )}
            {substyleOptions.map((name) => {
              const active = substyles.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleSubstyle(name)}
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[11px] transition',
                    active
                      ? 'bg-brand/20 text-brand'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-2 px-1 text-[11px] text-neutral-500">
          Click reproduce · doble click agrega al final · o arrastra a la
          playlist.
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
          {items.map((t) => {
            const isPlaying =
              player.playingKey === `${t.source}:${t.sourceId}`;
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => onItemDragStart(t.id)}
                onDragEnd={onItemDragEnd}
                onClick={() => {
                  // Click: reproducir abajo (esperando por si es doble click).
                  if (clickTimer.current) clearTimeout(clickTimer.current);
                  clickTimer.current = setTimeout(() => {
                    clickTimer.current = null;
                    if (player.canPlay(t)) player.playAudio(t);
                  }, 220);
                }}
                onDoubleClick={() => {
                  if (clickTimer.current) {
                    clearTimeout(clickTimer.current);
                    clickTimer.current = null;
                  }
                  onAddTrack?.(t.id);
                }}
                title={
                  onAddTrack
                    ? 'Click para reproducir · doble click para agregar al final'
                    : 'Click para reproducir'
                }
                className={clsx(
                  'flex cursor-pointer select-none items-center gap-2 rounded-lg border border-transparent p-1.5 transition hover:border-neutral-700 hover:bg-neutral-800/60 active:cursor-grabbing',
                  isPlaying && 'bg-brand/15',
                )}
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
            );
          })}
        </div>
      </div>
    </aside>
  );
}
