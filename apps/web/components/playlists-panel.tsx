'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Playlist, PlaylistItem } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Input, Spinner, StyleBadge } from './ui';
import { formatTotalDuration } from '@/lib/format';
import { areSimilarTracks } from '@/lib/similarity';
import { trackThumbUrl } from './track-thumb';
import { usePlayer } from './player';
import { clsx } from './clsx';
import { DeleteIconButton } from '@/components/ui';

/**
 * Panel lateral de playlists internas con drill-down:
 * - Nivel 1: lista de playlists (el buscador filtra por nombre).
 * - Nivel 2 (al entrar a una): sus canciones (el buscador filtra por título/artista).
 *   Dos interacciones de arrastre:
 *     a) AGREGAR: canciones arrastradas desde la tabla Mis Canciones (`draggedTrackId`,
 *        usa drag-and-drop nativo HTML5; soltar -> `onAddTrack`).
 *     b) REORDENAR: desde el asa (⠿) de cada fila, con *pointer events* (no DnD nativo,
 *        para que funcione también con arrastres rápidos), PATCH /reorder + optimista.
 */
export function PlaylistsPanel({
  onClose,
  selectedId,
  onSelectedChange,
  draggedTrackId,
  onAddTrack,
  source = 'YOUTUBE',
  onPlaySpotify,
}: {
  onClose: () => void;
  selectedId: string | null;
  onSelectedChange: (id: string | null) => void;
  draggedTrackId: string | null;
  onAddTrack: (trackId: string, atIndex: number) => void;
  /** Plataforma: solo muestra las playlists internas de esa fuente. */
  source?: 'YOUTUBE' | 'SPOTIFY';
  /** Click en una canción de Spotify: gatilla el reproductor de Spotify. */
  onPlaySpotify?: (track: PlaylistItem['track']) => void;
}) {
  const [search, setSearch] = useState('');
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null); // reorden (pointer)
  const [optimistic, setOptimistic] = useState<PlaylistItem[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const player = usePlayer();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['playlists', source],
    queryFn: () => api<Playlist[]>(`/music/playlists?source=${source}`),
  });

  const reorderMut = useMutation({
    mutationFn: (itemIds: string[]) =>
      api(`/music/playlists/${selectedId}/reorder`, {
        method: 'PATCH',
        body: { itemIds },
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });

  const removeMut = useMutation({
    mutationFn: (itemId: string) =>
      api(`/music/playlists/${selectedId}/items/${itemId}`, {
        method: 'DELETE',
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  });

  const playlists = data ?? [];
  const selected = selectedId
    ? (playlists.find((p) => p.id === selectedId) ?? null)
    : null;
  const q = search.trim().toLowerCase();

  const filteredPlaylists = useMemo(
    () =>
      q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists,
    [playlists, q],
  );

  // Orden mostrado: el optimista si lo hay (tras reordenar), si no el del servidor.
  const serverItems = useMemo(() => selected?.items ?? [], [selected]);
  // Si cambia la playlist o su *membresía* (alta/baja), descartamos el optimista.
  // Un reorder NO cambia la membresía, así que el optimista sobrevive al refetch.
  const memberKey = useMemo(
    () => serverItems.map((i) => i.id).slice().sort().join(','),
    [serverItems],
  );
  useEffect(() => {
    setOptimistic(null);
  }, [selectedId, memberKey]);

  const songs = optimistic ?? serverItems;
  // Resumen de la playlist: cuántas bachatas/salsas y la duración total.
  const summary = useMemo(() => {
    let bachata = 0;
    let salsa = 0;
    let seconds = 0;
    for (const it of songs) {
      const t = it.track;
      if (!t) continue;
      if (t.style === 'BACHATA') bachata++;
      else if (t.style === 'SALSA') salsa++;
      seconds += t.durationSec ?? 0;
    }
    return { bachata, salsa, seconds };
  }, [songs]);
  // Canciones (casi) duplicadas: título/artista muy parecidos o mismo video.
  const dupIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < songs.length; i++) {
      const a = songs[i].track;
      if (!a) continue;
      for (let j = i + 1; j < songs.length; j++) {
        const b = songs[j].track;
        if (b && areSimilarTracks(a, b)) {
          ids.add(songs[i].id);
          ids.add(songs[j].id);
        }
      }
    }
    return ids;
  }, [songs]);
  const visibleSongs = useMemo(() => {
    if (!q) return songs;
    return songs.filter((it) => {
      const t = it.track;
      return (
        t &&
        (t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
      );
    });
  }, [songs, q]);

  const externalActive = Boolean(draggedTrackId && selected); // agregar desde la tabla (DnD nativo)
  const reordering = dragId !== null; // mover una fila (pointer)
  const anyDnd = externalActive || reordering;

  function moveItem(
    arr: PlaylistItem[],
    id: string,
    insertIndex: number,
  ): PlaylistItem[] | null {
    const from = arr.findIndex((i) => i.id === id);
    if (from === -1) return null;
    const copy = arr.slice();
    const [moved] = copy.splice(from, 1);
    let to = insertIndex;
    if (from < insertIndex) to -= 1; // compensa el hueco que dejó al sacarlo
    to = Math.max(0, Math.min(to, copy.length));
    copy.splice(to, 0, moved);
    return copy;
  }

  // Índice de inserción según la posición vertical del cursor (lee el DOM en vivo,
  // por eso aguanta movimientos rápidos y la lista scrolleando).
  function computeDropIndex(clientY: number): number {
    const el = scrollRef.current;
    if (!el) return songs.length;
    const rows = Array.from(
      el.querySelectorAll<HTMLElement>('[data-song-row]'),
    );
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return k;
    }
    return rows.length;
  }

  function commitReorder(id: string, insertIndex: number) {
    const arr = moveItem(songs, id, insertIndex);
    if (!arr) return;
    const before = songs.map((i) => i.id).join(',');
    const after = arr.map((i) => i.id).join(',');
    if (before === after) return; // soltó en el mismo lugar
    setOptimistic(arr);
    reorderMut.mutate(arr.map((i) => i.id));
  }

  // --- Reorden por pointer events --------------------------------------------
  function startReorder(id: string, clientY: number, el: HTMLElement, pid: number) {
    dragIdRef.current = id;
    pointerYRef.current = clientY;
    setDragId(id);
    setDropIndex(computeDropIndex(clientY));
    try {
      el.setPointerCapture(pid);
    } catch {
      /* noop */
    }
  }
  function moveReorder(clientY: number) {
    if (dragIdRef.current == null) return;
    pointerYRef.current = clientY;
    const idx = computeDropIndex(clientY);
    setDropIndex((prev) => (prev === idx ? prev : idx));
  }
  function endReorder(clientY: number) {
    const id = dragIdRef.current;
    if (id == null) return;
    const idx = computeDropIndex(clientY);
    dragIdRef.current = null;
    pointerYRef.current = null;
    setDragId(null);
    setDropIndex(null);
    commitReorder(id, idx);
  }
  function cancelReorder() {
    dragIdRef.current = null;
    pointerYRef.current = null;
    setDragId(null);
    setDropIndex(null);
  }

  // Mientras reordenas, escucha el puntero a nivel de ventana: así sigue
  // funcionando aunque el cursor salga del panel (o de la ventana, con el botón
  // presionado), y el `pointerup` cierra el arrastre suelte donde suelte.
  useEffect(() => {
    if (!reordering) return;
    const onMove = (e: PointerEvent) => moveReorder(e.clientY);
    const onUp = (e: PointerEvent) => endReorder(e.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancelReorder);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancelReorder);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reordering]);

  // Auto-scroll + recálculo del destino mientras reordenas. Usa el último Y
  // conocido (pointerYRef), así basta con mantener el asa cerca del borde para
  // que la lista siga bajando/subiendo sola hasta el final, sin salir del panel.
  useEffect(() => {
    if (!reordering) return;
    const EDGE = 96; // zona "caliente" más amplia para alcanzarla fácil
    let raf = 0;
    const tick = () => {
      const el = scrollRef.current;
      const y = pointerYRef.current;
      if (el && y != null) {
        const r = el.getBoundingClientRect();
        // Acota la zona caliente a lo VISIBLE: el fondo del contenedor puede caer
        // bajo el viewport (detrás del reproductor), donde el cursor no llega.
        const top = Math.max(r.top, 0);
        const bottom = Math.min(r.bottom, window.innerHeight);
        let dir = 0;
        let speed = 0;
        if (y < top + EDGE) {
          dir = -1;
          speed = Math.min(1, (top + EDGE - y) / EDGE);
        } else if (y > bottom - EDGE) {
          dir = 1;
          speed = Math.min(1, (y - (bottom - EDGE)) / EDGE);
        }
        if (dir !== 0) {
          el.scrollTop += dir * (6 + speed * 26);
          const idx = computeDropIndex(y);
          setDropIndex((prev) => (prev === idx ? prev : idx));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reordering]);

  // --- Agregar desde la tabla (DnD nativo) -----------------------------------
  function handleExternalDrop() {
    const idx = dropIndex ?? songs.length;
    setDropIndex(null);
    if (draggedTrackId) onAddTrack(draggedTrackId, idx);
  }

  // Auto-scroll para el arrastre nativo (agregar desde la tabla): escucha a nivel
  // de documento para seguir aunque el cursor salga del panel.
  useEffect(() => {
    if (!externalActive) return;
    const EDGE = 70;
    let dir = 0;
    let speed = 0;
    const onDragOver = (e: DragEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const y = e.clientY;
      if (y < r.top + EDGE) {
        dir = -1;
        speed = Math.min(1, (r.top + EDGE - y) / EDGE);
      } else if (y > r.bottom - EDGE) {
        dir = 1;
        speed = Math.min(1, (y - (r.bottom - EDGE)) / EDGE);
      } else {
        dir = 0;
      }
    };
    document.addEventListener('dragover', onDragOver);
    let raf = 0;
    const tick = () => {
      const el = scrollRef.current;
      if (el && dir !== 0) el.scrollTop += dir * (4 + speed * 18);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      cancelAnimationFrame(raf);
    };
  }, [externalActive]);

  return (
    <aside className="flex max-h-[60vh] w-full shrink-0 flex-col rounded-xl border border-neutral-800 bg-neutral-900/60 max-lg:order-first lg:sticky lg:top-0 lg:max-h-[calc(100vh-7rem)] lg:w-72">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          {selected && (
            <button
              onClick={() => {
                onSelectedChange(null);
                setSearch('');
              }}
              title="Volver a playlists"
              className="shrink-0 rounded-md bg-neutral-800 px-1.5 py-0.5 text-sm hover:bg-neutral-700"
            >
              ←
            </button>
          )}
          <h3 className="truncate text-sm font-semibold">
            {selected ? selected.name : '🎵 Playlists Internas'}
          </h3>
        </div>
        <button
          onClick={onClose}
          title="Cerrar"
          className="shrink-0 rounded-md bg-neutral-800 px-2 py-0.5 text-sm hover:bg-neutral-700"
        >
          ✕
        </button>
      </div>

      <div className="border-b border-neutral-800 p-1.5">
        <Input
          placeholder={selected ? 'Buscar canción…' : 'Buscar playlist…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div
        ref={scrollRef}
        className={clsx(
          'flex-1 overflow-y-auto p-2',
          anyDnd && 'rounded-b-xl ring-1 ring-inset ring-brand/40',
        )}
        onDragOver={(e) => {
          if (!externalActive) return;
          e.preventDefault();
          setDropIndex(songs.length); // fallback: zona vacía -> al final
        }}
        onDrop={(e) => {
          if (!externalActive) return;
          e.preventDefault();
          handleExternalDrop();
        }}
      >
        {isLoading && <Spinner />}

        {/* Nivel 1: lista de playlists */}
        {!isLoading && !selected && (
          <>
            {filteredPlaylists.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-neutral-500">
                {q ? 'Sin resultados.' : 'No tienes playlists internas.'}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {filteredPlaylists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectedChange(p.id);
                    setSearch('');
                  }}
                  className="rounded-lg border border-transparent px-2 py-1.5 text-left leading-tight transition hover:border-neutral-700 hover:bg-neutral-800/60"
                >
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-[11px] text-neutral-500">
                    {p.items?.length ?? 0} canciones
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Nivel 2: canciones de la playlist (drop target + reordenable) */}
        {selected && (
          <>
            {songs.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-800/30 px-2 py-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                  <span className="text-base font-bold leading-none">
                    {summary.bachata}
                  </span>
                  bachata{summary.bachata === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300">
                  <span className="text-base font-bold leading-none">
                    {summary.salsa}
                  </span>
                  salsa{summary.salsa === 1 ? '' : 's'}
                </span>
                <span className="ml-auto text-right text-xs text-neutral-400">
                  {songs.length} · {formatTotalDuration(summary.seconds)}
                </span>
              </div>
            )}
            {dupIds.size > 0 && (
              <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200/90">
                ⚠️ {dupIds.size} posible{dupIds.size === 1 ? '' : 's'} duplicada
                {dupIds.size === 1 ? '' : 's'} (título/artista muy parecidos).
              </div>
            )}
            {externalActive && (
              <p className="mb-1 px-1 text-center text-[10px] text-brand">
                Suelta para agregar
              </p>
            )}
            {!anyDnd && songs.length > 0 && !q && (
              <p className="mb-1 px-1 text-[10px] text-neutral-500">
                Arrastra desde el asa ⠿ para reordenar.
              </p>
            )}
            {visibleSongs.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-neutral-500">
                {q ? 'Sin resultados.' : 'Playlist vacía.'}
              </p>
            )}
            <div className="flex flex-col">
              {/* Al arrastrar se muestra la lista completa (índices reales); sin
                  arrastrar, la filtrada por el buscador. La línea de destino es un
                  box-shadow (no ocupa layout, no parpadea). */}
              {(anyDnd ? songs : visibleSongs).map((it, i, arr) => {
                const t = it.track;
                const url = t ? trackThumbUrl(t) : null;
                const showTop = anyDnd && dropIndex === i;
                const showBottom =
                  anyDnd && dropIndex === songs.length && i === arr.length - 1;
                const playable = !!t && player.canPlay(t);
                const isSpotify = !!t && t.source === 'SPOTIFY';
                const clickable = playable || (isSpotify && !!onPlaySpotify);
                const isPlaying =
                  !!t && player.playingKey === `${t.source}:${t.sourceId}`;
                const isDragged = dragId === it.id;
                // Reordenar solo sin filtro de texto (los índices deben ser reales).
                const canReorder = !q;
                return (
                  <div
                    key={it.id}
                    data-song-row
                    title={clickable ? 'Reproducir' : undefined}
                    onClick={() => {
                      if (!t) return;
                      if (isSpotify) onPlaySpotify?.(t);
                      else if (playable) player.playAudio(t);
                    }}
                    onDragOver={(e) => {
                      // Solo para el arrastre nativo (agregar desde la tabla).
                      if (!externalActive) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY - r.top > r.height / 2;
                      const idx = after ? i + 1 : i;
                      if (idx !== dropIndex) setDropIndex(idx);
                    }}
                    className={clsx(
                      'flex select-none items-center gap-2 rounded-lg p-1 hover:bg-neutral-800/40',
                      clickable && 'cursor-pointer',
                      isPlaying && 'bg-brand/15',
                      dupIds.has(it.id) &&
                        'ring-1 ring-inset ring-amber-500/50',
                      isDragged && 'opacity-40',
                      showTop &&
                        'shadow-[inset_0_3px_0_0_var(--color-brand),inset_0_11px_11px_-9px_var(--color-brand)]',
                      showBottom &&
                        'shadow-[inset_0_-3px_0_0_var(--color-brand),inset_0_-11px_11px_-9px_var(--color-brand)]',
                    )}
                  >
                    {/* Asa de arrastre (pointer events; robusto con arrastres rápidos). */}
                    {canReorder && (
                      <span
                        role="button"
                        aria-label="Arrastra para reordenar"
                        title="Arrastra para reordenar"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          startReorder(it.id, e.clientY, e.currentTarget, e.pointerId);
                        }}
                        className="-ml-0.5 flex h-8 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-base leading-none text-neutral-500 transition hover:bg-neutral-700/50 hover:text-neutral-200 active:cursor-grabbing"
                      >
                        ⠿
                      </span>
                    )}
                    <span className="w-4 shrink-0 text-right text-[10px] text-neutral-600">
                      {i + 1}
                    </span>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="aspect-video w-12 shrink-0 select-none rounded bg-neutral-800 object-cover"
                      />
                    ) : (
                      <div className="aspect-video w-12 shrink-0 rounded bg-neutral-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {dupIds.has(it.id) && (
                          <span title="Posible duplicada" className="mr-1">
                            ⚠️
                          </span>
                        )}
                        {t?.title ?? '—'}
                      </div>
                      <div className="truncate text-[10px] text-neutral-500">
                        {t?.artist ?? ''}
                      </div>
                    </div>
                    {t && <StyleBadge style={t.style} compact />}
                    <DeleteIconButton
                      type="button"
                      title="Quitar de la playlist"
                      aria-label="Quitar de la playlist"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOptimistic(songs.filter((s) => s.id !== it.id));
                        removeMut.mutate(it.id);
                      }}
                      className="shrink-0 px-1.5 py-0.5 text-[11px]"
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 px-1">
              <Link
                href={`/music/playlists/${selected.id}`}
                className="text-[11px] text-brand hover:underline"
              >
                Abrir detalle ↗
              </Link>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
