'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { Playlist } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Input, Spinner, StyleBadge } from './ui';
import { trackThumbUrl } from './track-thumb';
import { usePlayer } from './player';
import { clsx } from './clsx';

/**
 * Panel lateral de playlists internas con drill-down:
 * - Nivel 1: lista de playlists (el buscador filtra por nombre).
 * - Nivel 2 (al entrar a una): sus canciones (el buscador filtra por título/artista),
 *   y acepta agregar canciones arrastradas desde la tabla (con línea de destino).
 *
 * `selectedId` es controlado por la página (para que la tabla sepa qué playlist
 * está abierta al hacer doble click). `draggedTrackId` es la canción que se está
 * arrastrando desde la tabla; al soltar, llama `onAddTrack(trackId, atIndex)`.
 */
export function PlaylistsPanel({
  onClose,
  selectedId,
  onSelectedChange,
  draggedTrackId,
  onAddTrack,
}: {
  onClose: () => void;
  selectedId: string | null;
  onSelectedChange: (id: string | null) => void;
  draggedTrackId: string | null;
  onAddTrack: (trackId: string, atIndex: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const player = usePlayer();

  const { data, isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => api<Playlist[]>('/music/playlists'),
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

  // Sin filtro de texto al soltar (para que el índice coincida con el orden real).
  const songs = selected?.items ?? [];
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

  function handleDrop() {
    const idx = dropIndex ?? songs.length;
    setDropIndex(null);
    if (draggedTrackId) onAddTrack(draggedTrackId, idx);
  }

  const dndActive = Boolean(draggedTrackId && selected);

  // Auto-scroll mientras arrastras: si el mouse está cerca del borde (o fuera del
  // panel, arriba/abajo), la lista sube/baja sola. Escucha a nivel de documento
  // para que funcione aunque el cursor salga del panel.
  useEffect(() => {
    if (!dndActive) return;
    const EDGE = 70; // zona "caliente" en px
    let dir = 0; // -1 arriba, 1 abajo
    let speed = 0; // 0..1
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
      // Sigue scrolleando en la última dirección aunque el cursor salga de la
      // ventana; se frena al soltar (cleanup por dragEnd) o al volver a la zona
      // central (dir = 0).
      if (el && dir !== 0) {
        el.scrollTop += dir * (4 + speed * 18);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      cancelAnimationFrame(raf);
    };
  }, [dndActive]);

  return (
    <aside className="sticky top-0 flex max-h-[calc(100vh-7rem)] w-72 shrink-0 flex-col rounded-xl border border-neutral-800 bg-neutral-900/60">
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

      <div className="border-b border-neutral-800 p-2">
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
          dndActive && 'rounded-b-xl ring-1 ring-inset ring-brand/40',
        )}
        onDragOver={(e) => {
          if (!dndActive) return;
          e.preventDefault();
          // Fallback: soltar en zona vacía -> al final.
          setDropIndex(songs.length);
        }}
        onDrop={(e) => {
          if (!dndActive) return;
          e.preventDefault();
          handleDrop();
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
            <div className="flex flex-col gap-1">
              {filteredPlaylists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectedChange(p.id);
                    setSearch('');
                  }}
                  className="rounded-lg border border-transparent p-2 text-left transition hover:border-neutral-700 hover:bg-neutral-800/60"
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

        {/* Nivel 2: canciones de la playlist (drop target) */}
        {selected && (
          <>
            {dndActive && (
              <p className="mb-1 px-1 text-center text-[10px] text-brand">
                Suelta para agregar
              </p>
            )}
            {visibleSongs.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-neutral-500">
                {q ? 'Sin resultados.' : 'Playlist vacía.'}
              </p>
            )}
            <div className="flex flex-col">
              {/* Al arrastrar se muestra la lista completa (índices reales para
                  posicionar bien); sin arrastrar, la filtrada por el buscador.
                  La línea de destino es un box-shadow (no ocupa layout, no parpadea). */}
              {(dndActive ? songs : visibleSongs).map((it, i, arr) => {
                const t = it.track;
                const url = t ? trackThumbUrl(t) : null;
                const showTop = dndActive && dropIndex === i;
                const showBottom =
                  dndActive &&
                  dropIndex === songs.length &&
                  i === arr.length - 1;
                const playable = !!t && player.canPlay(t);
                const isPlaying =
                  !!t && player.playingKey === `${t.source}:${t.sourceId}`;
                return (
                  <div
                    key={it.id}
                    title={playable ? 'Reproducir' : undefined}
                    onClick={() => {
                      if (t && playable) player.playAudio(t);
                    }}
                    onDragOver={(e) => {
                      if (!dndActive) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY - r.top > r.height / 2;
                      const idx = after ? i + 1 : i;
                      if (idx !== dropIndex) setDropIndex(idx);
                    }}
                    className={clsx(
                      'flex items-center gap-2 rounded-lg p-1 hover:bg-neutral-800/40',
                      playable && 'cursor-pointer',
                      isPlaying && 'bg-brand/15',
                      showTop &&
                        'shadow-[inset_0_3px_0_0_var(--color-brand),inset_0_11px_11px_-9px_var(--color-brand)]',
                      showBottom &&
                        'shadow-[inset_0_-3px_0_0_var(--color-brand),inset_0_-11px_11px_-9px_var(--color-brand)]',
                    )}
                  >
                    <span className="w-4 shrink-0 text-right text-[10px] text-neutral-600">
                      {i + 1}
                    </span>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-12 shrink-0 rounded bg-neutral-800 object-cover"
                      />
                    ) : (
                      <div className="aspect-video w-12 shrink-0 rounded bg-neutral-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {t?.title ?? '—'}
                      </div>
                      <div className="truncate text-[10px] text-neutral-500">
                        {t?.artist ?? ''}
                      </div>
                    </div>
                    {t && <StyleBadge style={t.style} />}
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
