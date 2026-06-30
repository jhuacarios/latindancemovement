'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Playlist, PlaylistItem } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Spinner, StyleBadge } from '@/components/ui';
import { PlayButtons } from '@/components/play-buttons';
import { TrackThumb } from '@/components/track-thumb';
import { SourceLink } from '@/components/source-link';
import { YoutubeIcon } from '@/components/youtube-icon';
import { YoutubeFromTemplateModal } from '@/components/youtube-from-template-modal';
import { LibraryDrawer } from '@/components/library-drawer';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { clsx } from '@/components/clsx';
import { formatDuration, formatViews } from '@/lib/format';
import { useLayoutUI } from '@/lib/layout-ui';

type DropSide = { id: string; side: 'before' | 'after' } | null;

/** Duración total amigable: "1h 23min" o "45 min". */
function fmtTotalDuration(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}min` : `${m} min`;
}

/** Baraja un array in-place (Fisher-Yates). */
function shuffleInPlace<T>(a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

export default function PlaylistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { setCollapsed } = useLayoutUI();
  const [ytOpen, setYtOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Orden local (para arrastrar-soltar con respuesta inmediata).
  const [localItems, setLocalItems] = useState<PlaylistItem[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // Canción arrastrada desde el panel de Mis Canciones (para agregar).
  const [externalDragId, setExternalDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropSide>(null);
  // Editor de distribución (N bachatas / M salsas por bloque). null = cerrado.
  const [distForm, setDistForm] = useState<{ n: number; m: number } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => api<Playlist>(`/music/playlists/${id}`),
    enabled: !!id,
  });

  // Sincroniza el orden local cuando llegan/recargan los datos.
  useEffect(() => {
    setLocalItems(data?.items ?? null);
  }, [data]);

  // Al abrir el panel de Mis Canciones, contrae el menú lateral para dar espacio.
  useEffect(() => {
    setCollapsed(drawerOpen);
    return () => setCollapsed(false);
  }, [drawerOpen, setCollapsed]);

  const items = localItems ?? data?.items ?? [];
  const ytCount = items.filter((i) => i.track?.source === 'YOUTUBE').length;
  const inPlaylistIds = useMemo(
    () => new Set(items.map((i) => i.trackId)),
    [items],
  );

  const removeItem = useMutation({
    mutationFn: (itemId: string) =>
      api(`/music/playlists/${id}/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlist', id] }),
  });

  const reorder = useMutation({
    mutationFn: (itemIds: string[]) =>
      api(`/music/playlists/${id}/reorder`, {
        method: 'PATCH',
        body: { itemIds },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlist', id] }),
  });

  // Agrega una canción (desde Mis Canciones) en la posición indicada: la agrega
  // al final y, si hay destino, la reordena ahí.
  const addTrack = useMutation({
    mutationFn: async (args: { trackId: string; target: DropSide }) => {
      const updated = await api<Playlist>(`/music/playlists/${id}/items`, {
        method: 'POST',
        body: { trackId: args.trackId },
      });
      const newItem = updated.items?.find((i) => i.trackId === args.trackId);
      if (newItem && args.target && args.target.id !== newItem.id) {
        const rest = (updated.items ?? []).filter((i) => i.id !== newItem.id);
        let to = rest.findIndex((i) => i.id === args.target!.id);
        if (to !== -1) {
          if (args.target.side === 'after') to += 1;
          rest.splice(to, 0, newItem);
          await api(`/music/playlists/${id}/reorder`, {
            method: 'PATCH',
            body: { itemIds: rest.map((i) => i.id) },
          });
        }
      }
    },
    onSuccess: () => {
      setErr(null);
      void qc.invalidateQueries({ queryKey: ['playlist', id] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo agregar la canción.'),
  });

  // Reordena la playlist según el patrón configurado (N bachatas → M salsas,
  // repetido). Lo que sobra (no alcanza para un bloque completo) va al final.
  // Si `shuffle`, baraja cada estilo antes de armar los bloques. Acepta n/m
  // explícitos para reordenar con una distribución recién cambiada.
  function applyBlockOrder(shuffle = false, nOverride?: number, mOverride?: number) {
    const n = nOverride ?? data?.bachatasPerBlock ?? 0;
    const m = mOverride ?? data?.salsasPerBlock ?? 0;
    if (n + m === 0) return;
    const bachatas = items.filter((i) => i.track?.style === 'BACHATA');
    const salsas = items.filter((i) => i.track?.style !== 'BACHATA');
    if (shuffle) {
      shuffleInPlace(bachatas);
      shuffleInPlace(salsas);
    }
    const result: PlaylistItem[] = [];
    let bi = 0;
    let si = 0;
    while (bachatas.length - bi >= n && salsas.length - si >= m) {
      for (let k = 0; k < n; k++) result.push(bachatas[bi++]);
      for (let k = 0; k < m; k++) result.push(salsas[si++]);
    }
    while (bi < bachatas.length) result.push(bachatas[bi++]); // extras
    while (si < salsas.length) result.push(salsas[si++]);
    setLocalItems(result); // optimista
    reorder.mutate(result.map((i) => i.id));
  }

  // Guarda la nueva distribución y reordena las canciones a ese patrón,
  // manteniendo el orden actual de cada estilo (sin barajar).
  const changeDistribution = useMutation({
    mutationFn: ({ n, m }: { n: number; m: number }) =>
      api(`/music/playlists/${id}`, {
        method: 'PATCH',
        body: { bachatasPerBlock: n, salsasPerBlock: m },
      }),
    onSuccess: (_d, { n, m }) => {
      setDistForm(null);
      applyBlockOrder(false, n, m);
    },
    onError: (e) =>
      setErr(
        e instanceof ApiError ? e.message : 'No se pudo cambiar la distribución.',
      ),
  });

  function handleDrop() {
    const target = dropTarget;
    setDropTarget(null);

    // Soltada desde el panel de Mis Canciones: agregar.
    if (externalDragId) {
      const tid = externalDragId;
      setExternalDragId(null);
      addTrack.mutate({ trackId: tid, target });
      return;
    }

    // Reordenar dentro de la playlist.
    const draggingId = dragId;
    setDragId(null);
    if (!draggingId || !target || draggingId === target.id) return;

    const moved = items.find((i) => i.id === draggingId);
    if (!moved) return;
    const rest = items.filter((i) => i.id !== draggingId);
    let to = rest.findIndex((i) => i.id === target.id);
    if (to === -1) return;
    if (target.side === 'after') to += 1;
    rest.splice(to, 0, moved);
    setLocalItems(rest); // optimista
    reorder.mutate(rest.map((i) => i.id));
  }

  function confirmRemove(item: PlaylistItem) {
    setConfirm({
      title: 'Quitar de la playlist',
      danger: true,
      confirmLabel: 'Quitar',
      message: (
        <>
          ¿Quitar <b className="text-neutral-100">{item.track?.title}</b> de esta
          playlist? La canción sigue en el catálogo / Mis Canciones.
        </>
      ),
      onConfirm: () => removeItem.mutate(item.id),
    });
  }

  return (
    <div className="space-y-5">
      <Link href="/music/playlists" className="text-sm text-brand hover:underline">
        ← Volver a playlists
      </Link>

      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudo cargar la playlist.</p>}

      {data && (
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{data.name}</h1>
              <p className="text-sm text-neutral-400">
                {items.length} canciones ·{' '}
                <span className="text-amber-300">
                  {items.filter((i) => i.track?.style === 'BACHATA').length}{' '}
                  bachatas
                </span>{' '}
                /{' '}
                <span className="text-red-300">
                  {items.filter((i) => i.track?.style === 'SALSA').length} salsas
                </span>
                {' · '}
                {fmtTotalDuration(
                  items.reduce((a, i) => a + (i.track?.durationSec ?? 0), 0),
                )}
                {(() => {
                  const nd = items.filter(
                    (i) => i.track && i.track.durationSec == null,
                  ).length;
                  return nd > 0 ? ` (${nd} sin duración)` : '';
                })()}
                {data.targetBachataPct != null &&
                  ` · mix objetivo ${data.targetBachataPct}% bachata`}
              </p>
              {(data.bachatasPerBlock ?? 0) + (data.salsasPerBlock ?? 0) > 0 &&
                items.length > 0 &&
                (() => {
                  const n = data.bachatasPerBlock ?? 0;
                  const m = data.salsasPerBlock ?? 0;
                  const b = items.filter(
                    (i) => i.track?.style === 'BACHATA',
                  ).length;
                  const s = items.filter(
                    (i) => i.track?.style === 'SALSA',
                  ).length;
                  // Bloques objetivo: los necesarios para contener todas las
                  // canciones del estilo más "lleno" (redondeando hacia arriba).
                  const blocks = Math.max(
                    n > 0 ? Math.ceil(b / n) : 0,
                    m > 0 ? Math.ceil(s / m) : 0,
                  );
                  const missB = n > 0 ? blocks * n - b : 0;
                  const missS = m > 0 ? blocks * m - s : 0;
                  if (blocks === 0 || (missB === 0 && missS === 0)) {
                    return (
                      <p className="text-xs text-clave">
                        ✓ {blocks} bloques completos ({n}/{m})
                      </p>
                    );
                  }
                  const parts: string[] = [];
                  if (missB > 0)
                    parts.push(`${missB} bachata${missB === 1 ? '' : 's'}`);
                  if (missS > 0)
                    parts.push(`${missS} salsa${missS === 1 ? '' : 's'}`);
                  return (
                    <p className="text-xs text-amber-300/90">
                      Para {blocks} bloques completos ({n}/{m}) faltan:{' '}
                      {parts.join(' y ')}.
                    </p>
                  );
                })()}
            </div>
            <div className="flex flex-wrap gap-2">
              {(data.bachatasPerBlock != null ||
                data.salsasPerBlock != null) &&
                items.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => applyBlockOrder(false)}
                      disabled={reorder.isPending}
                      title={`Reordena en bloques de ${data.bachatasPerBlock ?? 0} bachatas → ${data.salsasPerBlock ?? 0} salsas; los sobrantes van al final`}
                    >
                      🧱 Ordenar en bloques ({data.bachatasPerBlock ?? 0}/
                      {data.salsasPerBlock ?? 0})
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => applyBlockOrder(true)}
                      disabled={reorder.isPending}
                      title="Igual que ordenar en bloques, pero baraja las canciones de cada estilo antes"
                    >
                      🔀 Ordenar + barajar
                    </Button>
                  </>
                )}
              {items.length > 1 && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setDistForm({
                      n: data.bachatasPerBlock ?? 5,
                      m: data.salsasPerBlock ?? 3,
                    })
                  }
                  title="Cambiar cuántas bachatas y salsas por bloque, y reordenar las canciones a ese patrón manteniendo el orden actual"
                >
                  ⚙️ Cambiar distribución
                </Button>
              )}
              <Button
                variant={drawerOpen ? 'primary' : 'ghost'}
                onClick={() => setDrawerOpen((o) => !o)}
                title="Buscar en Mis Canciones y arrastrarlas a la playlist"
              >
                ＋ Agregar canciones
              </Button>
              <Button
                variant="ghost"
                disabled={ytCount === 0}
                title={
                  ytCount === 0
                    ? 'No hay canciones de YouTube en esta playlist'
                    : 'Crear una playlist en YouTube con estas canciones (snapshot)'
                }
                onClick={() => setYtOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <YoutubeIcon className="h-4 w-4 text-[#FF0000]" />
                  Crear playlist en YouTube
                </span>
              </Button>
            </div>
          </div>

          {err && <Card className="text-sm text-red-300">{err}</Card>}

          {items.length > 1 && (
            <p className="text-xs text-neutral-500">
              Arrastra una fila para reordenar
              {drawerOpen && ', o arrastra canciones desde el panel para agregarlas'}
              .
            </p>
          )}

          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 text-left text-neutral-400">
                <tr>
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-3 py-3 w-16"></th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Artista</th>
                  <th className="px-4 py-3">Estilo</th>
                  <th className="px-4 py-3">Duración</th>
                  <th className="px-4 py-3">Año</th>
                  <th className="px-4 py-3">Reproducciones</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr
                    key={item.id}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const side =
                        e.clientY - rect.top < rect.height / 2
                          ? 'before'
                          : 'after';
                      if (dropTarget?.id !== item.id || dropTarget?.side !== side) {
                        setDropTarget({ id: item.id, side });
                      }
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropTarget(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop();
                    }}
                    className={clsx(
                      'cursor-grab select-none border-b border-neutral-800/60 last:border-0 transition-colors active:cursor-grabbing',
                      dragId === item.id && 'opacity-40',
                      dropTarget?.id === item.id &&
                        dragId !== item.id &&
                        (dropTarget.side === 'before'
                          ? 'shadow-[inset_0_3px_0_0_var(--color-brand),inset_0_14px_16px_-12px_var(--color-brand)]'
                          : 'shadow-[inset_0_-3px_0_0_var(--color-brand),inset_0_-14px_16px_-12px_var(--color-brand)]'),
                      activeRowId === item.id ? 'bg-brand/10' : 'hover:bg-brand/5',
                    )}
                  >
                    <td className="px-4 py-3 text-neutral-500">{idx + 1}</td>
                    <td className="px-3 py-2">
                      {item.track && <TrackThumb track={item.track} />}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {item.track?.title ?? '—'}
                      {item.isWarmup && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
                          warmup
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {item.track?.artist ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {item.track && (
                        <div className="flex flex-wrap items-center gap-1">
                          <StyleBadge style={item.track.style} />
                          {item.track.substyles?.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                            >
                              {s}
                            </span>
                          ))}
                          {item.track.tags?.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-neutral-400">
                      {formatDuration(item.track?.durationSec)}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {item.track?.year ?? '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-neutral-400">
                      {formatViews(item.track?.details?.viewCount)}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={() => setActiveRowId(item.id)}
                    >
                      <div className="flex items-center justify-end gap-2">
                        {item.track && <PlayButtons track={item.track} />}
                        {item.track && <SourceLink track={item.track} />}
                        <button
                          className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-400 transition hover:bg-red-600/20 hover:text-red-300 disabled:opacity-50"
                          disabled={removeItem.isPending}
                          title="Quitar de la playlist"
                          aria-label="Quitar de la playlist"
                          onClick={() => confirmRemove(item)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      onDragOver={(e) => externalDragId && e.preventDefault()}
                      onDrop={(e) => {
                        if (!externalDragId) return;
                        e.preventDefault();
                        const tid = externalDragId;
                        setExternalDragId(null);
                        addTrack.mutate({ trackId: tid, target: null });
                      }}
                      className={clsx(
                        'px-4 py-8 text-center text-neutral-500',
                        externalDragId &&
                          'shadow-[inset_0_0_0_2px_var(--color-brand)]',
                      )}
                    >
                      {externalDragId
                        ? 'Suelta aquí para agregar a la playlist'
                        : 'Playlist vacía.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          </div>

          {drawerOpen && (
            <LibraryDrawer
              excludeTrackIds={inPlaylistIds}
              onClose={() => setDrawerOpen(false)}
              onItemDragStart={setExternalDragId}
              onItemDragEnd={() => {
                setExternalDragId(null);
                setDropTarget(null);
              }}
              onAddTrack={(tid) =>
                addTrack.mutate({ trackId: tid, target: null })
              }
            />
          )}
        </div>
      )}

      {ytOpen && data && (
        <YoutubeFromTemplateModal
          playlistId={id}
          playlistName={data.name}
          itemCount={ytCount}
          onClose={() => setYtOpen(false)}
        />
      )}

      {distForm && data && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !changeDistribution.isPending && setDistForm(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">⚙️ Cambiar distribución</h2>
              <button
                onClick={() => setDistForm(null)}
                className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-neutral-400">
              Define el patrón por bloque. Las canciones se reordenan a esta
              distribución manteniendo el orden actual de cada estilo (no se
              barajan). Los sobrantes van al final.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-400">
                  Bachatas por bloque
                </label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={distForm.n}
                  onChange={(e) =>
                    setDistForm({
                      ...distForm,
                      n: Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-400">
                  Salsas por bloque
                </label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={distForm.m}
                  onChange={(e) =>
                    setDistForm({
                      ...distForm,
                      m: Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                    })
                  }
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              {distForm.n + distForm.m > 0
                ? `Bloques de ${distForm.n} bachata${distForm.n === 1 ? '' : 's'} → ${distForm.m} salsa${distForm.m === 1 ? '' : 's'}.`
                : 'Indica al menos una canción por bloque.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={changeDistribution.isPending}
                onClick={() => setDistForm(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  changeDistribution.isPending || distForm.n + distForm.m === 0
                }
                onClick={() =>
                  changeDistribution.mutate({ n: distForm.n, m: distForm.m })
                }
              >
                {changeDistribution.isPending ? 'Aplicando…' : 'Aplicar y reordenar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
