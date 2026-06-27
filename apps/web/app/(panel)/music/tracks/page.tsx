'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type DanceStyle,
  type LibrarySummary,
  type Paginated,
  type Playlist,
  type Track,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { AddTrackForm, type NewTrackBody } from '@/components/add-track-form';
import { PlayButtons } from '@/components/play-buttons';
import { usePlayer } from '@/components/player';
import { SearchInput } from '@/components/search-input';
import { StyleFilter } from '@/components/style-filter';
import { PlaylistsPanel } from '@/components/playlists-panel';
import { TrackThumb } from '@/components/track-thumb';
import { formatDuration } from '@/lib/format';
import { useThumbs } from '@/lib/use-thumbs';
import { SourceLink } from '@/components/source-link';
import { TagEditor } from '@/components/tag-editor';
import { SubstyleFilterSelect } from '@/components/substyle-select';
import { SortTh, nextSort, type SortState } from '@/components/sort-th';
import { YoutubePlaylistModal } from '@/components/youtube-playlist-modal';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';

const PAGE_SIZE = 30;

export default function MyTracksPage() {
  const qc = useQueryClient();
  const player = usePlayer();
  const { user } = useAuth();
  const perms = usePermissions();
  const canEdit = user ? perms.can(user.role, 'music', 'editar') : false;
  const canDelete = user ? perms.can(user.role, 'music', 'eliminar') : false;
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [substyle, setSubstyle] = useState('');
  const [page, setPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);
  // Panel de playlists: playlist abierta + canción que se arrastra desde la tabla.
  const [panelSelectedId, setPanelSelectedId] = useState<string | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  // Toasts flotantes (abajo al centro) para el feedback de agregar por doble click.
  const [toasts, setToasts] = useState<
    { id: number; message: string; type: 'success' | 'error' }[]
  >([]);
  const toastId = useRef(0);
  function pushToast(message: string, type: 'success' | 'error') {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }
  const [sort, setSort] = useState<SortState>({ by: '', dir: 'asc' });
  const onSort = (col: string, primary: 'asc' | 'desc') => {
    setSort((s) => nextSort(s, col, primary));
    setPage(1);
  };
  const [showForm, setShowForm] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [tagTrack, setTagTrack] = useState<Track | null>(null);
  const [showYtPlaylist, setShowYtPlaylist] = useState(false);
  const [showThumb, toggleThumb] = useThumbs();

  // Agrega una canción a la playlist abierta del panel en la posición indicada
  // (atIndex 0-based; un número grande = al final).
  const addTrack = useMutation({
    mutationFn: async (args: {
      playlistId: string;
      trackId: string;
      atIndex: number;
    }) => {
      const updated = await api<Playlist>(
        `/music/playlists/${args.playlistId}/items`,
        { method: 'POST', body: { trackId: args.trackId } },
      );
      const items = updated.items ?? [];
      const newItem = items.find((i) => i.trackId === args.trackId);
      if (!newItem) return;
      const rest = items.filter((i) => i.id !== newItem.id);
      const idx = Math.max(0, Math.min(args.atIndex, rest.length));
      if (idx < rest.length) {
        rest.splice(idx, 0, newItem);
        await api(`/music/playlists/${args.playlistId}/reorder`, {
          method: 'PATCH',
          body: { itemIds: rest.map((i) => i.id) },
        });
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['playlists'] }),
    onError: () => {
      /* el flujo por arrastre no notifica; el doble click maneja su propio toast */
    },
  });

  // Arrastre: agrega en la posición indicada, sin toast (feedback visual del panel).
  function addToOpenPlaylist(trackId: string, atIndex: number) {
    if (!panelSelectedId) return;
    addTrack.mutate({ playlistId: panelSelectedId, trackId, atIndex });
  }

  // Doble click: agrega al final y notifica con un toast (éxito o error).
  async function addByDoubleClick(t: Track) {
    if (!panelSelectedId) return;
    try {
      await addTrack.mutateAsync({
        playlistId: panelSelectedId,
        trackId: t.id,
        atIndex: Number.MAX_SAFE_INTEGER,
      });
      pushToast(`✓ “${t.title}” agregada a la playlist`, 'success');
    } catch (e) {
      pushToast(
        e instanceof ApiError ? e.message : 'No se pudo agregar la canción',
        'error',
      );
    }
  }

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['library', { search, style, substyle, page, sort }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (style) p.set('style', style);
      if (substyle) p.set('substyle', substyle);
      if (sort.by) {
        p.set('sortBy', sort.by);
        p.set('sortDir', sort.dir);
      }
      p.set('page', String(page));
      p.set('pageSize', String(PAGE_SIZE));
      return api<Paginated<Track>>(`/music/library?${p.toString()}`);
    },
  });

  const { data: summary } = useQuery({
    queryKey: ['library-summary'],
    queryFn: () => api<LibrarySummary>('/music/library/summary'),
  });

  const remove = useMutation({
    mutationFn: (trackId: string) =>
      api(`/music/library/${trackId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['library-summary'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
  });

  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => api(`/music/library/${id}`, { method: 'DELETE' })),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['library-summary'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      exitSelect();
    },
  });

  const pageIds = data?.data.map((t) => t.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mis Canciones</h1>
          <p className="text-sm text-neutral-400">
            {data ? `${data.total} en tu selección` : ' '} ·{' '}
            <Link href="/music/catalog" className="text-brand hover:underline">
              elegir del catálogo →
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={toggleThumb}>
            {showThumb ? '🖼 Ocultar thumbnails' : '🖼 Thumbnails'}
          </Button>
          <Button variant="ghost" onClick={() => setShowYtPlaylist(true)}>
            ▶️ Crear playlist YouTube rápida
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            >
              {selectMode ? 'Cancelar selección' : '☑ Seleccionar'}
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cerrar' : '+ Agregar mi música'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-pink-500/30 bg-pink-500/10 px-4 py-2">
          <span className="text-2xl font-bold text-pink-300">
            {summary?.bachata ?? '—'}
          </span>
          <span className="text-sm text-neutral-300">Bachatas</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
          <span className="text-2xl font-bold text-amber-300">
            {summary?.salsa ?? '—'}
          </span>
          <span className="text-sm text-neutral-300">Salsas</span>
        </div>
      </div>

      {selectMode && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">
            {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
          </span>
          <Button
            variant="danger"
            disabled={selected.size === 0 || bulkRemove.isPending}
            onClick={() =>
              setConfirm({
                title: 'Quitar seleccionadas',
                danger: true,
                confirmLabel: `Quitar ${selected.size}`,
                message: (
                  <>
                    ¿Quitar {selected.size} canción
                    {selected.size === 1 ? '' : 'es'} de tu selección? Las
                    personales se eliminarán por completo.
                  </>
                ),
                onConfirm: () => bulkRemove.mutate(Array.from(selected)),
              })
            }
          >
            {bulkRemove.isPending
              ? 'Quitando…'
              : `Quitar seleccionadas (${selected.size})`}
          </Button>
        </Card>
      )}

      {showForm && (
        <AddTrackForm
          title="Agregar mi música (privada)"
          submitLabel="Guardar en mis canciones"
          onCreate={(body: NewTrackBody) =>
            api('/music/library/personal', { method: 'POST', body })
          }
          onDone={() => {
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: ['library'] });
            void qc.invalidateQueries({ queryKey: ['library-summary'] });
          }}
        />
      )}

      <Card className="flex flex-wrap items-end gap-3">
        <div className="grow">
          <label className="mb-1 block text-xs text-neutral-400">Buscar</label>
          <SearchInput
            placeholder="Título o artista…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Estilo</label>
          <StyleFilter
            value={style}
            onChange={(v) => {
              setStyle(v);
              setSubstyle('');
              setPage(1);
            }}
          />
        </div>
        {style && (
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Sub-estilo
            </label>
            <SubstyleFilterSelect
              style={style as DanceStyle}
              value={substyle}
              onChange={(v) => {
                setSubstyle(v);
                setPage(1);
              }}
            />
          </div>
        )}
        <div className="ml-auto">
          <label className="mb-1 block text-xs text-neutral-400">&nbsp;</label>
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            title="Ver mis playlists internas"
            className={
              'rounded-lg border px-3 py-2 text-sm transition ' +
              (panelOpen
                ? 'border-brand bg-brand/15 text-brand'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800')
            }
          >
            🎵 Playlists
          </button>
        </div>
      </Card>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-4">
      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudieron cargar tus canciones.</p>}

      {data && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-neutral-400">
              <tr>
                {selectMode && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-brand)]"
                      checked={allSelected}
                      onChange={toggleAll}
                      title="Seleccionar todo"
                    />
                  </th>
                )}
                {showThumb && <th className="px-3 py-3 w-20"></th>}
                <SortTh label="Título" col="title" primary="asc" sort={sort} onSort={onSort} />
                <SortTh label="Artista" col="artist" primary="asc" sort={sort} onSort={onSort} />
                <th className="px-4 py-3">Estilo</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Duración</th>
                <SortTh label="Año" col="year" primary="desc" sort={sort} onSort={onSort} />
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((t) => (
                <tr
                  key={t.id}
                  draggable={!!panelSelectedId}
                  onDragStart={() => setDraggedTrackId(t.id)}
                  onDragEnd={() => setDraggedTrackId(null)}
                  onDoubleClick={() => addByDoubleClick(t)}
                  title={
                    panelSelectedId
                      ? 'Doble click: agregar al final · Arrastra: posición exacta'
                      : undefined
                  }
                  className={
                    'border-b border-neutral-800/60 last:border-0 ' +
                    (panelSelectedId ? 'cursor-grab select-none ' : '') +
                    (player.playingKey === `${t.source}:${t.sourceId}`
                      ? 'bg-brand/10'
                      : selected.has(t.id)
                        ? 'bg-brand/5'
                        : '')
                  }
                >
                  {selectMode && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="accent-[var(--color-brand)]"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSel(t.id)}
                      />
                    </td>
                  )}
                  {showThumb && (
                    <td className="px-3 py-2">
                      <TrackThumb track={t} />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-neutral-300">{t.artist}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <StyleBadge style={t.style} />
                      {t.substyles?.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                        >
                          {s}
                        </span>
                      ))}
                      {t.tags?.map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.scope === 'PERSONAL' ? (
                      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">
                        personal
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-700/40 px-2 py-0.5 text-xs text-neutral-400">
                        catálogo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-400 tabular-nums">
                    {formatDuration(t.durationSec)}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{t.year ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <PlayButtons track={t} />
                      {canEdit && (
                        <button
                          className="rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
                          title="Editar tags"
                          aria-label="Editar tags"
                          onClick={() => setTagTrack(t)}
                        >
                          🏷
                        </button>
                      )}
                      <SourceLink track={t} />
                      {canDelete && (
                      <button
                        className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-400 hover:bg-red-600/20 hover:text-red-300"
                        onClick={() =>
                          setConfirm({
                            title: 'Quitar canción',
                            danger: true,
                            confirmLabel: 'Quitar',
                            message: (
                              <>
                                ¿Quitar <b>{t.title}</b> de tus canciones?
                                <br />
                                {t.scope === 'PERSONAL'
                                  ? 'Es una canción personal: se eliminará por completo.'
                                  : 'Se quitará de tu selección (seguirá en el catálogo).'}
                              </>
                            ),
                            onConfirm: () => remove.mutate(t.id),
                          })
                        }
                        title="Quitar de mis canciones"
                        aria-label="Quitar de mis canciones"
                      >
                        🗑
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td
                    colSpan={(selectMode ? 8 : 7) + (showThumb ? 1 : 0)}
                    className="px-4 py-10 text-center text-neutral-500"
                  >
                    Aún no tienes canciones. Agrega tu música o{' '}
                    <Link href="/music/catalog" className="text-brand hover:underline">
                      elige del catálogo
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </Button>
          <span className="text-neutral-400">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente →
          </Button>
        </div>
      )}
        </div>
        {panelOpen && (
          <PlaylistsPanel
            onClose={() => setPanelOpen(false)}
            selectedId={panelSelectedId}
            onSelectedChange={setPanelSelectedId}
            draggedTrackId={draggedTrackId}
            onAddTrack={addToOpenPlaylist}
          />
        )}
      </div>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      {tagTrack && (
        <TagEditor
          trackId={tagTrack.id}
          title={`${tagTrack.title} — ${tagTrack.artist}`}
          style={tagTrack.style}
          onClose={() => setTagTrack(null)}
        />
      )}

      {showYtPlaylist && (
        <YoutubePlaylistModal onClose={() => setShowYtPlaylist(false)} />
      )}

      {/* Toasts flotantes abajo al centro (sobre la barra del reproductor). */}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'rounded-lg px-4 py-2 text-sm text-white shadow-lg backdrop-blur-md ' +
              (t.type === 'success' ? 'bg-emerald-600/40' : 'bg-red-600/40')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
