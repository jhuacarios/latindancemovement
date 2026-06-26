'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Playlist, PlaylistItem } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';
import { PlayButtons } from '@/components/play-buttons';
import { TrackThumb } from '@/components/track-thumb';
import { SourceLink } from '@/components/source-link';
import { YoutubeIcon } from '@/components/youtube-icon';
import { YoutubeFromTemplateModal } from '@/components/youtube-from-template-modal';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { clsx } from '@/components/clsx';

export default function PlaylistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const [ytOpen, setYtOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  // Orden local (para arrastrar-soltar con respuesta inmediata).
  const [localItems, setLocalItems] = useState<PlaylistItem[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    side: 'before' | 'after';
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => api<Playlist>(`/music/playlists/${id}`),
    enabled: !!id,
  });

  // Sincroniza el orden local cuando llegan/recargan los datos.
  useEffect(() => {
    setLocalItems(data?.items ?? null);
  }, [data]);

  const items = localItems ?? data?.items ?? [];
  const ytCount = items.filter((i) => i.track?.source === 'YOUTUBE').length;

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

  function handleDrop() {
    const target = dropTarget;
    setDropTarget(null);
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
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{data.name}</h1>
              <p className="text-sm text-neutral-400">
                {data.items?.length ?? 0} canciones · estado {data.status}
                {data.targetBachataPct != null &&
                  ` · mix objetivo ${data.targetBachataPct}% bachata`}
              </p>
            </div>
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

          {items.length > 1 && (
            <p className="text-xs text-neutral-500">
              Arrastra una fila (desde el número, la miniatura o un espacio vacío)
              para reordenar.
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
                      {item.track && <StyleBadge style={item.track.style} />}
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
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                      Playlist vacía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {ytOpen && data && (
        <YoutubeFromTemplateModal
          playlistId={id}
          playlistName={data.name}
          itemCount={ytCount}
          onClose={() => setYtOpen(false)}
        />
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
