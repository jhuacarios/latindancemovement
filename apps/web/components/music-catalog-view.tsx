'use client';

import { useEffect, useRef, useState } from 'react';
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
import { formatDuration, formatReleaseDate, formatViews } from '@/lib/format';
import { useThumbs } from '@/lib/use-thumbs';
import { SourceLink } from '@/components/source-link';
import { EditTrackModal } from '@/components/edit-track-modal';
import { SubstyleFilterSelect } from '@/components/substyle-select';
import { SortTh, nextSort, type SortState } from '@/components/sort-th';
import { PlaylistImportModal } from '@/components/playlist-import-modal';
import { SpotifyImportModal } from '@/components/spotify-import-modal';
import { SpotifyCatalogImportModal } from '@/components/spotify-catalog-import-modal';
import {
  SpotifyPlayerBar,
  type SpotifyPlayable,
} from '@/components/spotify-player-bar';
import { PlatformIcon } from '@/components/platform-icon';
import { DuplicatesModal } from '@/components/duplicates-modal';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';

// Sin paginación por ahora: traemos todo el catálogo de una.
const PAGE_SIZE = 1000;

/** Columnas que se pueden mostrar/ocultar desde el engranaje. Título y acciones
 * siempre visibles; la miniatura tiene su propio toggle. */
type ColKey = 'artist' | 'style' | 'duration' | 'year' | 'views' | 'added';
type ColVis = Record<ColKey, boolean>;

const COLUMN_DEFS: { key: ColKey; label: string; youtubeOnly?: boolean }[] = [
  { key: 'artist', label: 'Artista' },
  { key: 'style', label: 'Estilo' },
  { key: 'duration', label: 'Duración' },
  { key: 'year', label: 'Fecha' },
  { key: 'views', label: 'Reproducciones', youtubeOnly: true },
  { key: 'added', label: 'Agregado' },
];

const ALL_COLS_VISIBLE: ColVis = {
  artist: true,
  style: true,
  duration: true,
  year: true,
  views: true,
  added: true,
};

/**
 * Catálogo reutilizable para una fuente (YouTube o Spotify). Cada fuente lista
 * solo sus canciones; las herramientas masivas propias de YouTube (duraciones,
 * reproducciones, importar playlist de YouTube) no se mezclan con Spotify.
 */
export function MusicCatalogView({
  source,
}: {
  source: 'YOUTUBE' | 'SPOTIFY';
}) {
  const isSpotify = source === 'SPOTIFY';
  const permKey = isSpotify ? 'music.spotify.catalog' : 'music.youtube.catalog';

  const { user } = useAuth();
  const perms = usePermissions();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const canEdit = user ? perms.can(user.role, permKey, 'editar') : false;
  const canDelete = user ? perms.can(user.role, permKey, 'eliminar') : false;
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
  // Columnas visibles (persistidas por fuente) + menú del engranaje.
  const colsStorageKey = `nectason.catalogCols.${source}`;
  const [cols, setCols] = useState<ColVis>(ALL_COLS_VISIBLE);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(colsStorageKey);
      if (raw) setCols({ ...ALL_COLS_VISIBLE, ...JSON.parse(raw) });
    } catch {
      /* preferencia inválida: usa defaults */
    }
  }, [colsStorageKey]);

  function toggleCol(key: ColKey) {
    setCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(colsStorageKey, JSON.stringify(next));
      } catch {
        /* ignora si no hay storage */
      }
      return next;
    });
  }

  useEffect(() => {
    if (!colMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [colMenuOpen]);
  const [showSpotifyImport, setShowSpotifyImport] = useState(false);
  // Reproducción de Spotify en la barra inferior de la página.
  const [spotifyPlaying, setSpotifyPlaying] = useState<SpotifyPlayable | null>(
    null,
  );

  const onSort = (col: string, primary: 'asc' | 'desc') => {
    setSort((s) => nextSort(s, col, primary));
    setPage(1);
  };

  // Reproducciones (viewCount) solo aplica a YouTube; las rellena al montar.
  useEffect(() => {
    if (!isAdmin || isSpotify) return;
    api<{ updated: number }>('/music/tracks/backfill-views', { method: 'POST' })
      .then((r) => {
        if (r.updated > 0) qc.invalidateQueries({ queryKey: ['catalog'] });
      })
      .catch(() => {});
  }, [isAdmin, isSpotify, qc]);

  // Fecha de lanzamiento: rellena en lotes (Spotify por ID/búsqueda, o subida de
  // YouTube). Corre una vez por montaje, en bucle hasta terminar; la columna se
  // refresca a medida que llegan. Solo admin (hace llamadas a Spotify).
  const releaseBackfillRan = useRef(false);
  useEffect(() => {
    if (!isAdmin || releaseBackfillRan.current) return;
    releaseBackfillRan.current = true;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 40 && !cancelled; i++) {
        try {
          const r = await api<{ updated: number; remaining: number }>(
            '/music/tracks/backfill-release-dates',
            { method: 'POST' },
          );
          if (r.updated > 0) qc.invalidateQueries({ queryKey: ['catalog'] });
          if (r.remaining === 0) break;
        } catch {
          break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, qc]);

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
    queryKey: ['catalog', source, { search, style, substyle, page, sort }],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set('source', source);
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
  // Cuenta de columnas visibles (para el colSpan del estado vacío): Título +
  // acciones siempre; el resto según toggles/fuente/selección/miniatura.
  const baseCols =
    2 +
    (selectMode ? 1 : 0) +
    (showThumb ? 1 : 0) +
    (cols.artist ? 1 : 0) +
    (cols.style ? 1 : 0) +
    (cols.duration ? 1 : 0) +
    (cols.year ? 1 : 0) +
    (!isSpotify && cols.views ? 1 : 0) +
    (cols.added ? 1 : 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <PlatformIcon source={source} className="h-6 w-6 shrink-0" /> Catálogo
            <span className="text-sm font-normal text-neutral-500">
              ({isSpotify ? 'Spotify' : 'YouTube'})
            </span>
          </h1>
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
          source={source}
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

      {isAdmin &&
        (isSpotify ? (
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-sm font-semibold">
                Gestión del catálogo de Spotify:
              </span>
              <Button onClick={() => setShowSpotifyImport(true)}>
                🟢 Importar playlist Spotify
              </Button>
              <span className="text-xs text-neutral-500">
                o agrega una por “+ Nueva canción al catálogo” con su link.
              </span>
            </div>
          </Card>
        ) : (
          <AdminImportExport />
        ))}

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
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-brand)]"
                      checked={allSelected}
                      onChange={toggleAll}
                      title="Seleccionar todo"
                    />
                  </th>
                )}
                {showThumb && <th className="px-3 py-2 w-20"></th>}
                <SortTh label="Título" col="title" primary="asc" sort={sort} onSort={onSort} />
                {cols.artist && (
                  <SortTh label="Artista" col="artist" primary="asc" sort={sort} onSort={onSort} />
                )}
                {cols.style && <th className="px-4 py-2">Estilo</th>}
                {cols.duration && <th className="px-4 py-2">Duración</th>}
                {cols.year && (
                  <SortTh label="Fecha" col="year" primary="desc" sort={sort} onSort={onSort} />
                )}
                {!isSpotify && cols.views && (
                  <SortTh label="Reproducciones" col="views" primary="desc" sort={sort} onSort={onSort} />
                )}
                {cols.added && (
                  <SortTh label="Agregado" col="createdAt" primary="desc" sort={sort} onSort={onSort} />
                )}
                <th className="px-4 py-2 text-right">
                  <div className="relative inline-block" ref={colMenuRef}>
                    <button
                      type="button"
                      onClick={() => setColMenuOpen((o) => !o)}
                      title="Mostrar u ocultar columnas"
                      aria-label="Configurar columnas"
                      aria-expanded={colMenuOpen}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2 py-1 text-xs font-normal text-neutral-300 transition hover:bg-neutral-800"
                    >
                      ⚙️ <span className="hidden sm:inline">Columnas</span>
                    </button>
                    {colMenuOpen && (
                      <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-left shadow-xl">
                        <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Columnas
                        </p>
                        <label className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-500">
                          <input type="checkbox" checked disabled className="accent-[var(--color-brand)]" />
                          Título
                        </label>
                        <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800">
                          <input
                            type="checkbox"
                            checked={showThumb}
                            onChange={toggleThumb}
                            className="accent-[var(--color-brand)]"
                          />
                          Miniatura
                        </label>
                        {COLUMN_DEFS.filter(
                          (c) => !(c.youtubeOnly && isSpotify),
                        ).map((c) => (
                          <label
                            key={c.key}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                          >
                            <input
                              type="checkbox"
                              checked={cols[c.key]}
                              onChange={() => toggleCol(c.key)}
                              className="accent-[var(--color-brand)]"
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </th>
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
                  {cols.artist && (
                    <td className="px-4 py-3 text-neutral-300">{t.artist}</td>
                  )}
                  {cols.style && (
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
                  )}
                  {cols.duration && (
                    <td className="px-4 py-3 text-neutral-400 tabular-nums">
                      {formatDuration(t.durationSec)}
                    </td>
                  )}
                  {cols.year && (
                    <td className="px-4 py-3 text-neutral-400">
                      {formatReleaseDate(t.releaseDate, t.year)}
                    </td>
                  )}
                  {!isSpotify && cols.views && (
                    <td className="px-4 py-3 tabular-nums text-neutral-400">
                      {formatViews(t.details?.viewCount)}
                    </td>
                  )}
                  {cols.added && (
                    <td className="px-4 py-3 text-neutral-400">
                      {new Date(t.createdAt).toLocaleDateString('es-CL')}
                    </td>
                  )}
                  <td
                    className="px-4 py-3 text-right"
                    onClick={() => setActiveRowId(t.id)}
                  >
                    <div className="flex items-center justify-end gap-2">
                      <PlayButtons track={t} />
                      {isSpotify && (
                        <button
                          type="button"
                          title={
                            spotifyPlaying?.sourceId === t.sourceId
                              ? 'Detener'
                              : 'Reproducir (Spotify)'
                          }
                          aria-label="Reproducir"
                          onClick={() =>
                            setSpotifyPlaying(
                              spotifyPlaying?.sourceId === t.sourceId
                                ? null
                                : {
                                    sourceId: t.sourceId,
                                    title: t.title,
                                    artist: t.artist,
                                    imageUrl: t.coverUrl,
                                  },
                            )
                          }
                          className={
                            'flex h-7 w-7 items-center justify-center rounded-full text-xs transition ' +
                            (spotifyPlaying?.sourceId === t.sourceId
                              ? 'bg-brand text-white'
                              : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700')
                          }
                        >
                          {spotifyPlaying?.sourceId === t.sourceId ? '⏸' : '▶'}
                        </button>
                      )}
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
                    colSpan={baseCols}
                    className="px-4 py-10 text-center text-neutral-500"
                  >
                    {isSpotify
                      ? 'El catálogo de Spotify está vacío. Agrega canciones con su link de Spotify.'
                      : 'El catálogo está vacío.'}
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

      {showSpotifyImport && (
        <SpotifyCatalogImportModal onClose={() => setShowSpotifyImport(false)} />
      )}

      {spotifyPlaying && (
        <>
          <div className="h-24" />
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-800 bg-neutral-900/95 p-3 backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <SpotifyPlayerBar
                track={spotifyPlaying}
                onClose={() => setSpotifyPlaying(null)}
              />
            </div>
          </div>
        </>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/** Import/export del catálogo de YouTube (solo admin). */
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
