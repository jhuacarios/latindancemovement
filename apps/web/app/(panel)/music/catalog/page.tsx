'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type DanceStyle,
  type ExcelImportResult,
  type Paginated,
  type Track,
} from '@baile-latino/types';
import { api, ApiError, downloadFile, uploadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import { AddTrackForm, type NewTrackBody } from '@/components/add-track-form';
import { PlayButtons } from '@/components/play-buttons';
import { SearchInput } from '@/components/search-input';
import { StyleFilter } from '@/components/style-filter';
import { TrackThumb } from '@/components/track-thumb';
import { formatDuration, formatViews } from '@/lib/format';
import { useThumbs } from '@/lib/use-thumbs';
import { SourceLink } from '@/components/source-link';
import { EditTrackModal } from '@/components/edit-track-modal';
import { SubstyleFilterSelect } from '@/components/substyle-select';
import { SortTh, nextSort, type SortState } from '@/components/sort-th';
import { PlaylistImportModal } from '@/components/playlist-import-modal';
import { SpotifyImportModal } from '@/components/spotify-import-modal';
import { DuplicatesModal } from '@/components/duplicates-modal';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';

// Sin paginación por ahora: traemos todo el catálogo de una.
const PAGE_SIZE = 1000;

export default function CatalogPage() {
  const { user } = useAuth();
  const perms = usePermissions();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const canEdit = user ? perms.can(user.role, 'music', 'editar') : false;
  const canDelete = user ? perms.can(user.role, 'music', 'eliminar') : false;
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [substyle, setSubstyle] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ by: '', dir: 'asc' });
  const [showForm, setShowForm] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showThumb, toggleThumb] = useThumbs();
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const onSort = (col: string, primary: 'asc' | 'desc') => {
    setSort((s) => nextSort(s, col, primary));
    setPage(1);
  };

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
    queryKey: ['catalog', { search, style, substyle, page, sort }],
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
      return api<Paginated<Track>>(`/music/tracks?${p.toString()}`);
    },
  });

  const toggle = useMutation({
    mutationFn: (t: Track) =>
      t.inLibrary
        ? api(`/music/library/${t.id}`, { method: 'DELETE' })
        : api('/music/library', { method: 'POST', body: { trackId: t.id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
  });

  const bulkAdd = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          api('/music/library', { method: 'POST', body: { trackId: id } }),
        ),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
      exitSelect();
    },
  });

  const removeTrack = useMutation({
    mutationFn: (id: string) => api(`/music/tracks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
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
          <h1 className="text-2xl font-bold">📚 Catálogo</h1>
          <p className="text-sm text-neutral-400">
            {data ? `${data.total} canciones en la base` : ' '}
            {!isAdmin && ' · agrégalas a Mis Canciones'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={toggleThumb}>
            {showThumb ? '🖼 Ocultar thumbnails' : '🖼 Thumbnails'}
          </Button>
          {canEdit && (
            <Button
              variant="ghost"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            >
              {selectMode ? 'Cancelar selección' : '☑ Seleccionar'}
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cerrar' : '+ Nueva canción al catálogo'}
            </Button>
          )}
        </div>
      </div>

      {selectMode && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">
            {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
          </span>
          <Button
            disabled={selected.size === 0 || bulkAdd.isPending}
            onClick={() => bulkAdd.mutate(Array.from(selected))}
          >
            {bulkAdd.isPending
              ? 'Agregando…'
              : `➕ Agregar seleccionadas a mis canciones (${selected.size})`}
          </Button>
        </Card>
      )}

      {isAdmin && showForm && (
        <AddTrackForm
          title="Nueva canción al catálogo global"
          submitLabel="Agregar al catálogo"
          onCreate={(body: NewTrackBody) =>
            api('/music/tracks', { method: 'POST', body })
          }
          onDone={() => {
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: ['catalog'] });
            void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
          }}
        />
      )}

      {isAdmin && <AdminImportExport />}

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
      </Card>

      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudo cargar el catálogo.</p>}

      {data && (
        <Card className="p-0">
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
                <th className="px-4 py-3">Duración</th>
                <SortTh label="Año" col="year" primary="desc" sort={sort} onSort={onSort} />
                <th className="px-4 py-3">Reproducciones</th>
                <SortTh label="Agregado" col="createdAt" primary="desc" sort={sort} onSort={onSort} />
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((t) => (
                <tr
                  key={t.id}
                  className={
                    'border-b border-neutral-800/60 last:border-0 ' +
                    (activeRowId === t.id
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
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-400 tabular-nums">
                    {formatDuration(t.durationSec)}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{t.year ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-neutral-400">
                    {formatViews(t.details?.viewCount)}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {new Date(t.createdAt).toLocaleDateString('es-CL')}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    onClick={() => setActiveRowId(t.id)}
                  >
                    <div className="flex items-center justify-end gap-2">
                      <PlayButtons track={t} />
                      <SourceLink track={t} />
                      {canEdit && (
                        <button
                          className="rounded-md bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
                          title="Editar canción"
                          aria-label="Editar canción"
                          onClick={() => setEditTrack(t)}
                        >
                          ✏️
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-400 hover:bg-red-600/20 hover:text-red-300"
                          title="Eliminar del catálogo"
                          aria-label="Eliminar del catálogo"
                          onClick={() =>
                            setConfirm({
                              title: 'Eliminar del catálogo',
                              danger: true,
                              confirmLabel: 'Eliminar',
                              message: (
                                <>
                                  ¿Eliminar <b>{t.title}</b> del catálogo? Se
                                  quitará de las bibliotecas y playlists de todos
                                  los DJs. Esta acción no se puede deshacer.
                                </>
                              ),
                              onConfirm: () => removeTrack.mutate(t.id),
                            })
                          }
                        >
                          🗑
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className={
                            t.inLibrary
                              ? 'rounded-lg bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300'
                              : 'rounded-lg bg-brand/15 px-2 py-1 text-xs text-brand hover:bg-brand/25'
                          }
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate(t)}
                        >
                          {t.inLibrary ? '✓ En mis canciones' : '➕ Agregar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td
                    colSpan={(selectMode ? 9 : 8) + (showThumb ? 1 : 0)}
                    className="px-4 py-10 text-center text-neutral-500"
                  >
                    El catálogo está vacío.
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

      {editTrack && (
        <EditTrackModal
          track={editTrack}
          onClose={() => setEditTrack(null)}
          onSaved={() => {
            setEditTrack(null);
            void qc.invalidateQueries({ queryKey: ['catalog'] });
            void qc.invalidateQueries({ queryKey: ['library'] });
          }}
        />
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/** Import/export del catálogo global (solo admin). */
function AdminImportExport() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ExcelImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSpotify, setShowSpotify] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  async function onBackfill() {
    setBackfillMsg(null);
    setBackfilling(true);
    try {
      const res = await api<{ missing: number; updated: number }>(
        '/music/tracks/backfill-durations',
        { method: 'POST' },
      );
      setBackfillMsg(
        res.missing === 0
          ? 'Todas las canciones ya tenían duración.'
          : `✓ Duraciones completadas: ${res.updated} de ${res.missing}.`,
      );
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    } catch (e) {
      setBackfillMsg(
        e instanceof ApiError ? e.message : 'No se pudieron completar.',
      );
    } finally {
      setBackfilling(false);
    }
  }

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const res = await uploadFile<ExcelImportResult>(
        '/music/tracks/import-excel',
        file,
      );
      setResult(res);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['catalog-summary'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo importar');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm font-semibold">Gestión del catálogo:</span>
        <Button
          variant="ghost"
          onClick={() =>
            downloadFile('/music/tracks/template.xlsx', 'plantilla-canciones.xlsx')
          }
        >
          ⬇ Plantilla
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Importando…' : '⬆ Importar Excel'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => downloadFile('/music/tracks/export.xlsx', 'canciones.xlsx')}
        >
          ⬇ Exportar
        </Button>
        <Button
          variant="ghost"
          disabled={backfilling}
          onClick={onBackfill}
          title="Completa la duración faltante de las canciones del catálogo desde YouTube"
        >
          {backfilling ? 'Completando…' : '⏱ Completar duraciones'}
        </Button>
        <Button variant="ghost" onClick={() => setShowDuplicates(true)}>
          🔎 Buscar duplicados
        </Button>
        <Button onClick={() => setShowPlaylist(true)}>
          📺 Importar playlist YouTube
        </Button>
        <Button onClick={() => setShowSpotify(true)}>
          🟢 Importar playlist Spotify
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {backfillMsg && (
        <p className="mt-3 text-sm text-neutral-300">{backfillMsg}</p>
      )}
      {result && (
        <p className="mt-3 text-sm text-neutral-300">
          Filas: {result.totalRows} · creadas {result.created} · actualizadas{' '}
          {result.updated} · errores {result.errors.length}
        </p>
      )}

      {showPlaylist && (
        <PlaylistImportModal onClose={() => setShowPlaylist(false)} />
      )}
      {showSpotify && (
        <SpotifyImportModal onClose={() => setShowSpotify(false)} />
      )}
      {showDuplicates && (
        <DuplicatesModal onClose={() => setShowDuplicates(false)} />
      )}
    </Card>
  );
}
