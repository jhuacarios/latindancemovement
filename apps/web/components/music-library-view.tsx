'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  formatDuration,
  formatReleaseDate,
  formatViewsPerDay,
  isNewRelease,
  isWithinLastMonths,
  viewsPerDay,
} from '@/lib/format';
import { NewBadge } from '@/components/new-badge';
import { EpicBadge } from '@/components/epic-badge';
import { areSimilarTracks, buildEpicMatcher } from '@/lib/similarity';
import { useThumbs } from '@/lib/use-thumbs';
import { SourceLink } from '@/components/source-link';
import { PlatformIcon } from '@/components/platform-icon';
import {
  SpotifyPlayerBar,
  type SpotifyPlayable,
} from '@/components/spotify-player-bar';
import { TagEditor } from '@/components/tag-editor';
import { SubstyleFilterMultiSelect } from '@/components/substyle-select';
import { SortTh, nextSort, type SortState } from '@/components/sort-th';
import { YoutubeIcon } from '@/components/youtube-icon';
import { YoutubePlaylistModal } from '@/components/youtube-playlist-modal';
import { PlaylistImportModal } from '@/components/playlist-import-modal';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import { Button, Card, DeleteIconButton, Spinner, StyleBadge } from '@/components/ui';

const PAGE_SIZE = 50;
/** Se carga todo lo que matchea búsqueda+estilo y se filtra/pagina en cliente
 * (igual que el Catálogo), para que los filtros calculados (nuevas/épicas/meses)
 * cubran toda la selección, no solo una página. */
const LOAD_SIZE = 1000;

/** Columnas que se pueden mostrar/ocultar desde el engranaje. Título, "#" y
 * acciones siempre visibles; la miniatura tiene su propio toggle. */
type ColKey = 'artist' | 'style' | 'origin' | 'duration' | 'date' | 'vpd';
type ColVis = Record<ColKey, boolean>;

const COLUMN_DEFS: { key: ColKey; label: string; youtubeOnly?: boolean }[] = [
  { key: 'artist', label: 'Artista' },
  { key: 'style', label: 'Estilo' },
  { key: 'origin', label: 'Origen' },
  { key: 'duration', label: 'Duración' },
  { key: 'date', label: 'Fecha' },
  { key: 'vpd', label: 'Repr./día', youtubeOnly: true },
];

const ALL_COLS_VISIBLE: ColVis = {
  artist: true,
  style: true,
  origin: true,
  duration: true,
  date: true,
  vpd: true,
};

/**
 * "Mis Canciones" reutilizable para una fuente (YouTube o Spotify). La biblioteca
 * y las playlists internas son las mismas; solo cambia el filtro por fuente, los
 * permisos y algunas herramientas propias de cada plataforma.
 */
export function MusicLibraryView({
  source,
}: {
  source: 'YOUTUBE' | 'SPOTIFY';
}) {
  const isSpotify = source === 'SPOTIFY';
  const permKey = isSpotify ? 'music.spotify.tracks' : 'music.youtube.tracks';
  const catalogHref = isSpotify ? '/music/spotify/catalog' : '/music/catalog';

  const qc = useQueryClient();
  const player = usePlayer();
  const { user } = useAuth();
  const perms = usePermissions();
  const canEdit = user ? perms.can(user.role, permKey, 'editar') : false;
  const canDelete = user ? perms.can(user.role, permKey, 'eliminar') : false;
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [substyles, setSubstyles] = useState<string[]>([]);
  const [onlyNew, setOnlyNew] = useState(false);
  /** Mostrar solo las marcadas como Épica (top 50 rep/día por estilo). */
  const [onlyEpic, setOnlyEpic] = useState(false);
  /** Filtrar a los últimos N meses (por fecha). '' = sin filtro. */
  const [lastMonths, setLastMonths] = useState('');
  /** Orden por Repr./día (client-side, es un valor calculado). null = sin orden. */
  const [vpdSort, setVpdSort] = useState<'asc' | 'desc' | null>(null);
  const [page, setPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSelectedId, setPanelSelectedId] = useState<string | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<
    { id: number; message: string; type: 'success' | 'error' }[]
  >([]);
  const toastId = useRef(0);

  // Solo si prefiere salsa se arranca con ese filtro; en el resto de los casos
  // (bachata, "me da igual" o sin elegir) queda "Todos", como siempre. Se aplica
  // una sola vez al llegar el usuario: después manda lo que él elija.
  const prefApplied = useRef(false);
  useEffect(() => {
    if (prefApplied.current || !user) return;
    prefApplied.current = true;
    if (user.stylePreference === 'SALSA') setStyle('SALSA');
  }, [user]);
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
  const [showImportPlaylist, setShowImportPlaylist] = useState(false);
  const [showThumb, toggleThumb] = useThumbs();
  // Columnas visibles (persistidas por fuente) + menú del engranaje.
  const colsStorageKey = `nectason.libraryCols.${source}`;
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
  // Reproducción de Spotify en la barra inferior de la página.
  const [spotifyPlaying, setSpotifyPlaying] = useState<SpotifyPlayable | null>(
    null,
  );

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
      /* cada llamador muestra su propio toast */
    },
  });

  /** Busca en la playlist abierta una canción (casi) igual a `t`. */
  function similarInOpenPlaylist(t: Track): Track | null {
    if (!panelSelectedId) return null;
    const pl = playlists?.find((p) => p.id === panelSelectedId);
    for (const it of pl?.items ?? []) {
      if (it.track && it.track.id !== t.id && areSimilarTracks(it.track, t)) {
        return it.track;
      }
    }
    return null;
  }

  async function addToOpenPlaylist(trackId: string, atIndex: number) {
    if (!panelSelectedId) return;
    const t = data?.data.find((x) => x.id === trackId) ?? null;
    const sim = t ? similarInOpenPlaylist(t) : null;
    try {
      await addTrack.mutateAsync({ playlistId: panelSelectedId, trackId, atIndex });
      if (sim && t) {
        pushToast(
          `⚠️ “${t.title}” se parece a “${sim.title}” que ya está en la playlist`,
          'error',
        );
      }
    } catch (e) {
      pushToast(
        e instanceof ApiError ? e.message : 'No se pudo agregar la canción',
        'error',
      );
    }
  }

  async function addByDoubleClick(t: Track) {
    if (!panelSelectedId) return;
    const sim = similarInOpenPlaylist(t);
    try {
      await addTrack.mutateAsync({
        playlistId: panelSelectedId,
        trackId: t.id,
        atIndex: Number.MAX_SAFE_INTEGER,
      });
      if (sim) {
        pushToast(
          `⚠️ “${t.title}” se parece a “${sim.title}” que ya está en la playlist`,
          'error',
        );
      } else {
        pushToast(`✓ “${t.title}” agregada a la playlist`, 'success');
      }
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

  // Pone al día los tags personales (hereda los del catálogo). Idempotente.
  useEffect(() => {
    api<{ seeded: number }>('/music/library/backfill-tags', { method: 'POST' })
      .then((r) => {
        if (r.seeded > 0) {
          qc.invalidateQueries({ queryKey: ['library'] });
          qc.invalidateQueries({ queryKey: ['tags-vocab'] });
        }
      })
      .catch(() => {});
  }, [qc]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['library', source, { search, style, sort }],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set('source', source);
      if (search) p.set('search', search);
      if (style) p.set('style', style);
      if (sort.by) {
        p.set('sortBy', sort.by);
        p.set('sortDir', sort.dir);
      }
      p.set('page', '1');
      p.set('pageSize', String(LOAD_SIZE));
      return api<Paginated<Track>>(`/music/library?${p.toString()}`);
    },
  });

  // Pill "Épica": top 50 por reproducciones/día de cada estilo (bachata: últimos
  // 24 meses; salsa: sin restricción), calculado sobre el catálogo de YouTube —
  // la única fuente con reproducciones. Spotify HEREDA la marca cruzando por
  // título+artista+estilo+duración casi iguales.
  const { data: epicData } = useQuery({
    queryKey: ['catalog-epic', 'YOUTUBE'],
    queryFn: () =>
      api<Paginated<Track>>('/music/tracks?source=YOUTUBE&pageSize=1000'),
  });
  const epicYt = useMemo(() => {
    const out: Track[] = [];
    const all = epicData?.data ?? [];
    for (const st of ['BACHATA', 'SALSA'] as const) {
      const maxMonths = st === 'SALSA' ? 0 : 24;
      const top = all
        .filter(
          (t) =>
            t.style === st &&
            isWithinLastMonths(t.releaseDate, t.year, maxMonths),
        )
        .map((t) => ({
          t,
          vpd: viewsPerDay(t.details?.viewCount, t.releaseDate) ?? -1,
        }))
        .filter((x) => x.vpd > 0)
        .sort((a, b) => b.vpd - a.vpd)
        .slice(0, 50);
      for (const x of top) out.push(x.t);
    }
    return out;
  }, [epicData]);
  // Ids de las filas marcadas como Épica: YouTube por sourceId (directo); Spotify
  // heredando de YouTube (título+artista+estilo+duración casi iguales).
  const epicIds = useMemo(() => {
    const rows = data?.data ?? [];
    if (isSpotify) {
      const match = buildEpicMatcher(epicYt);
      return new Set(rows.filter(match).map((r) => r.id));
    }
    const ytSourceIds = new Set(epicYt.map((t) => t.sourceId));
    return new Set(
      rows.filter((r) => ytSourceIds.has(r.sourceId)).map((r) => r.id),
    );
  }, [data, epicYt, isSpotify]);

  const { data: playlists } = useQuery({
    queryKey: ['playlists', source],
    queryFn: () => api<Playlist[]>(`/music/playlists?source=${source}`),
  });
  const openPlaylistTrackIds = useMemo(() => {
    if (!panelSelectedId) return new Set<string>();
    const pl = playlists?.find((p) => p.id === panelSelectedId);
    return new Set((pl?.items ?? []).map((i) => i.trackId));
  }, [playlists, panelSelectedId]);

  const { data: summary } = useQuery({
    queryKey: ['library-summary', source],
    queryFn: () =>
      api<LibrarySummary>(`/music/library/summary?source=${source}`),
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

  // Filtros calculados en cliente (nuevas/épicas/sub-estilos/últimos meses)
  // sobre TODO lo cargado, y luego paginado de a PAGE_SIZE.
  const monthsN = Number(lastMonths) || 0;
  const newCount = data
    ? data.data.filter((t) => isNewRelease(t.releaseDate)).length
    : 0;
  const epicCount = epicIds.size;
  const filteredRows = data
    ? data.data.filter(
        (t) =>
          (!onlyNew || isNewRelease(t.releaseDate)) &&
          (!onlyEpic || epicIds.has(t.id)) &&
          (substyles.length === 0 ||
            substyles.some((s) => t.substyles?.includes(s))) &&
          isWithinLastMonths(t.releaseDate, t.year, monthsN),
      )
    : [];
  // Orden por Repr./día (client-side); las sin dato van al final.
  const sortedRows = vpdSort
    ? [...filteredRows].sort((a, b) => {
        const va = viewsPerDay(a.details?.viewCount, a.releaseDate) ?? -1;
        const vb = viewsPerDay(b.details?.viewCount, b.releaseDate) ?? -1;
        return vpdSort === 'desc' ? vb - va : va - vb;
      })
    : filteredRows;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Si un filtro deja la página actual fuera de rango, vuelve a la 1.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pageIds = pageRows.map((t) => t.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  // Columnas del colSpan (estado vacío): "#" + Título + acciones siempre; el
  // resto según selección/miniatura/toggles.
  const baseCols =
    3 +
    (selectMode ? 1 : 0) +
    (showThumb ? 1 : 0) +
    (cols.artist ? 1 : 0) +
    (cols.style ? 1 : 0) +
    (cols.origin ? 1 : 0) +
    (cols.duration ? 1 : 0) +
    (cols.date ? 1 : 0) +
    (!isSpotify && cols.vpd ? 1 : 0);

  return (
    <div className="space-y-1.5 lg:space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div className="shrink-0">
          <h1 className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold lg:gap-2 lg:text-2xl">
            <PlatformIcon
              source={source}
              className="h-3.5 w-3.5 shrink-0 lg:h-6 lg:w-6"
            />{' '}
            Mis Canciones
            <span className="hidden text-[11px] font-normal text-neutral-500 lg:inline lg:text-sm">
              ({isSpotify ? 'Spotify' : 'YouTube'})
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 lg:gap-2">
          {!isSpotify && (
            <Button
              variant="ghost"
              className="inline-flex items-center gap-1.5 max-lg:gap-1 max-lg:px-2 max-lg:py-1 max-lg:text-[11px]"
              onClick={() => setShowYtPlaylist(true)}
            >
              <YoutubeIcon className="h-4 w-4 shrink-0 text-[#FF0000] max-lg:h-3 max-lg:w-3" />{' '}
              Crear playlist rápida
            </Button>
          )}
          {!isSpotify && canEdit && (
            <Button
              variant="ghost"
              className="inline-flex items-center gap-1.5 max-lg:gap-1 max-lg:px-2 max-lg:py-1 max-lg:text-[11px]"
              onClick={() => setShowImportPlaylist(true)}
            >
              <YoutubeIcon className="h-4 w-4 shrink-0 text-[#FF0000] max-lg:h-3 max-lg:w-3" />{' '}
              Cargar playlist
            </Button>
          )}
          {canEdit && (
            <Button
              className="max-lg:px-2 max-lg:py-1 max-lg:text-[11px]"
              onClick={() => setShowForm((s) => !s)}
            >
              {showForm ? 'Cerrar' : '+ Agregar mi música'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 lg:gap-3">
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 lg:gap-2 lg:px-4 lg:py-2">
          <span className="text-base font-bold text-amber-300 lg:text-2xl">
            {summary?.bachata ?? '—'}
          </span>
          <span className="text-[11px] text-neutral-300 lg:text-sm">
            Bachatas
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 lg:gap-2 lg:px-4 lg:py-2">
          <span className="text-base font-bold text-red-300 lg:text-2xl">
            {summary?.salsa ?? '—'}
          </span>
          <span className="text-[11px] text-neutral-300 lg:text-sm">Salsas</span>
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
          source={source}
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

      <Card className="flex flex-wrap items-end gap-1.5 px-2 py-1.5 lg:gap-3 lg:px-3 lg:py-2">
        <div className="grow">
          <label className="mb-1 block text-[10px] text-neutral-400 max-lg:hidden lg:text-xs">
            Buscar
          </label>
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
          <label className="mb-1 block text-[10px] text-neutral-400 max-lg:hidden lg:text-xs">
            Estilo
          </label>
          <StyleFilter
            value={style}
            onChange={(v) => {
              setStyle(v);
              setSubstyles([]);
              setPage(1);
            }}
          />
        </div>
        {style && (
          <div>
            <label className="mb-1 block text-[10px] text-neutral-400 max-lg:hidden lg:text-xs">
              Sub-estilo
            </label>
            <SubstyleFilterMultiSelect
              style={style as DanceStyle}
              value={substyles}
              onChange={(v) => {
                setSubstyles(v);
                setPage(1);
              }}
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-[10px] text-neutral-400 lg:text-xs">
            Últimos meses
          </label>
          <div className="flex items-center gap-1 rounded-lg border border-neutral-700 px-1.5 py-1 focus-within:border-brand lg:px-2 lg:py-1.5">
            <input
              type="text"
              inputMode="numeric"
              value={lastMonths}
              placeholder="—"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                setLastMonths(e.target.value.replace(/[^0-9]/g, '').slice(0, 3));
                setPage(1);
              }}
              className="w-8 bg-transparent text-xs text-neutral-200 [appearance:textfield] focus:outline-none lg:w-10 lg:text-sm"
            />
            <span className="text-[10px] text-neutral-500 lg:text-xs">meses</span>
            {lastMonths && (
              <button
                type="button"
                onClick={() => {
                  setLastMonths('');
                  setPage(1);
                }}
                title="Quitar filtro"
                className="ml-0.5 text-neutral-500 hover:text-neutral-200"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-neutral-400 max-lg:hidden lg:text-xs">
            Novedades
          </label>
          <button
            type="button"
            onClick={() => {
              setOnlyNew((v) => !v);
              setPage(1);
            }}
            title="Mostrar solo canciones lanzadas hace 2 meses o menos"
            className={
              'rounded-lg border px-2 py-1.5 text-xs transition lg:px-3 lg:py-2 lg:text-sm ' +
              (onlyNew
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800')
            }
          >
            ✨ Solo nuevas{newCount > 0 ? ` (${newCount})` : ''}
          </button>
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-neutral-400 max-lg:hidden lg:text-xs">
            Top
          </label>
          <button
            type="button"
            onClick={() => {
              setOnlyEpic((v) => !v);
              setPage(1);
            }}
            title={
              isSpotify
                ? 'Mostrar solo las Épicas (heredadas de YouTube por título/artista/duración)'
                : 'Mostrar solo las Épicas: top 50 por reproducciones/día de cada estilo'
            }
            className={
              'rounded-lg border px-2 py-1.5 text-xs transition lg:px-3 lg:py-2 lg:text-sm ' +
              (onlyEpic
                ? 'border-purple-500/60 bg-purple-500/15 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.5)]'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800')
            }
          >
            🔥 Solo épicas{epicCount > 0 ? ` (${epicCount})` : ''}
          </button>
        </div>
        <div className="ml-auto">
          <label className="mb-1 block text-[10px] text-neutral-400 max-lg:hidden lg:text-xs">
            &nbsp;
          </label>
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            title="Ver mis playlists internas"
            className={
              'rounded-lg border px-2 py-1.5 text-xs transition lg:px-3 lg:py-2 lg:text-sm ' +
              (panelOpen
                ? 'border-brand bg-brand/15 text-brand'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800')
            }
          >
            🎵 Playlists
          </button>
        </div>
      </Card>

      <div className="flex items-start gap-1.5 lg:gap-4">
        <div className="min-w-0 flex-1 space-y-1.5 lg:space-y-4">
          {isLoading && <Spinner />}
          {error && (
            <p className="text-sm text-red-300">
              No se pudieron cargar tus canciones.
            </p>
          )}

          {data && (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-[11px] lg:text-sm">
                {/* `whitespace-nowrap` (se hereda a los th) evita que un título
                    como "Fecha subida" se parta en dos líneas y duplique el alto
                    de la fila; `[&_th]` baja el padding solo del encabezado. */}
                <thead className="whitespace-nowrap border-b border-neutral-800 text-left text-neutral-400 [&_th]:py-1 lg:[&_th]:py-1">
                  <tr>
                    {selectMode && (
                      <th className="px-2 py-2 lg:px-4 lg:py-3 w-10">
                        <input
                          type="checkbox"
                          className="accent-[var(--color-brand)]"
                          checked={allSelected}
                          onChange={toggleAll}
                          title="Seleccionar todo"
                        />
                      </th>
                    )}
                    {/* Columna de numeración: en móvil casi sin aire lateral. */}
                    <th className="w-6 px-0.5 py-2 text-right tabular-nums lg:w-10 lg:px-4 lg:py-3">
                      #
                    </th>
                    {showThumb && (
                      <th className="px-2 py-2 lg:px-3 lg:py-3 w-20"></th>
                    )}
                    <SortTh label="Título" col="title" primary="asc" sort={sort} onSort={onSort} />
                    {cols.artist && (
                      <SortTh label="Artista" col="artist" primary="asc" sort={sort} onSort={onSort} />
                    )}
                    {cols.style && <th className="px-2 py-2 lg:px-4 lg:py-3">Estilo</th>}
                    {cols.origin && <th className="px-2 py-2 lg:px-4 lg:py-3">Origen</th>}
                    {cols.duration && <th className="px-2 py-2 lg:px-4 lg:py-3">Duración</th>}
                    {cols.date && (
                      <SortTh
                        label={isSpotify ? 'Fecha' : 'Fecha subida'}
                        col="releaseDate"
                        primary="desc"
                        sort={sort}
                        onSort={onSort}
                      />
                    )}
                    {!isSpotify && cols.vpd && (
                      <th
                        className="cursor-pointer select-none px-2 py-2 lg:px-4 lg:py-3 hover:text-neutral-200"
                        title="Reproducciones por día desde la subida (velocidad)"
                        onClick={() =>
                          setVpdSort((s) =>
                            s === 'desc' ? 'asc' : s === 'asc' ? null : 'desc',
                          )
                        }
                      >
                        <span className="inline-flex items-center gap-1">
                          Repr./día
                          <span
                            className={
                              'text-xs ' +
                              (vpdSort ? 'text-brand' : 'text-neutral-600')
                            }
                          >
                            {vpdSort === 'desc'
                              ? '▼'
                              : vpdSort === 'asc'
                                ? '▲'
                                : '↕'}
                          </span>
                        </span>
                      </th>
                    )}
                    <th className="px-2 py-2 lg:px-4 lg:py-3 text-right">
                      <div className="relative inline-block" ref={colMenuRef}>
                        <button
                          type="button"
                          onClick={() => setColMenuOpen((o) => !o)}
                          title="Mostrar u ocultar columnas"
                          aria-label="Configurar columnas"
                          aria-expanded={colMenuOpen}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2 py-0.5 text-xs font-normal text-neutral-300 transition hover:bg-neutral-800"
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
                                {c.key === 'date' && !isSpotify
                                  ? 'Fecha subida'
                                  : c.label}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t, i) => (
                    <tr
                      key={t.id}
                      draggable={!!panelSelectedId}
                      onDragStart={() => setDraggedTrackId(t.id)}
                      onDragEnd={() => setDraggedTrackId(null)}
                      onDoubleClick={() => addByDoubleClick(t)}
                      className={
                        'border-b border-neutral-800/60 last:border-0 ' +
                        (panelSelectedId ? 'cursor-grab select-none ' : '') +
                        (openPlaylistTrackIds.has(t.id)
                          ? 'shadow-[inset_3px_0_0_0_var(--color-clave)] '
                          : '') +
                        (player.playingKey === `${t.source}:${t.sourceId}`
                          ? 'bg-brand/10'
                          : selected.has(t.id)
                            ? 'bg-brand/5'
                            : '')
                      }
                      title={
                        openPlaylistTrackIds.has(t.id)
                          ? 'Ya está en esta playlist'
                          : panelSelectedId
                            ? 'Doble click: agregar al final · Arrastra: posición exacta'
                            : undefined
                      }
                    >
                      {selectMode && (
                        <td className="px-2 py-2 lg:px-4 lg:py-3">
                          <input
                            type="checkbox"
                            className="accent-[var(--color-brand)]"
                            checked={selected.has(t.id)}
                            onChange={() => toggleSel(t.id)}
                          />
                        </td>
                      )}
                      <td className="px-0.5 py-2 text-right tabular-nums text-neutral-500 lg:px-4 lg:py-3">
                        {(page - 1) * PAGE_SIZE + i + 1}
                      </td>
                      {showThumb && (
                        <td className="px-3 py-2">
                          <TrackThumb track={t} />
                        </td>
                      )}
                      <td className="px-2 py-2 lg:px-4 lg:py-3 font-medium">
                        {t.title}
                        {isNewRelease(t.releaseDate) && <NewBadge />}
                        {epicIds.has(t.id) && <EpicBadge />}
                      </td>
                      {cols.artist && (
                        <td className="px-2 py-2 lg:px-4 lg:py-3 text-neutral-300">{t.artist}</td>
                      )}
                      {cols.style && (
                        <td className="px-2 py-2 lg:px-4 lg:py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {/* En móvil solo la inicial (B/S) para ahorrar ancho. */}
                            <span className="lg:hidden">
                              <StyleBadge style={t.style} compact />
                            </span>
                            <span className="hidden lg:inline">
                              <StyleBadge style={t.style} />
                            </span>
                            {t.tags && t.tags.length > 0
                              ? t.tags.map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300"
                                  >
                                    {tag.name}
                                  </span>
                                ))
                              : t.substyles?.map((s) => (
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
                      {cols.origin && (
                        <td className="px-2 py-2 lg:px-4 lg:py-3">
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
                      )}
                      {cols.duration && (
                        <td className="px-2 py-2 lg:px-4 lg:py-3 text-neutral-400 tabular-nums">
                          {formatDuration(t.durationSec)}
                        </td>
                      )}
                      {cols.date && (
                        <td className="px-2 py-2 lg:px-4 lg:py-3 whitespace-nowrap text-neutral-400">
                          {formatReleaseDate(t.releaseDate, t.year)}
                        </td>
                      )}
                      {!isSpotify && cols.vpd && (
                        <td className="px-2 py-2 lg:px-4 lg:py-3 tabular-nums text-neutral-400">
                          {formatViewsPerDay(t.details?.viewCount, t.releaseDate)}
                        </td>
                      )}
                      <td className="px-2 py-2 lg:px-4 lg:py-3 text-right">
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
                            <DeleteIconButton
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
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={baseCols}
                        className="px-4 py-10 text-center text-neutral-500"
                      >
                        {data.data.length > 0 ? (
                          'Ninguna canción coincide con los filtros.'
                        ) : (
                          <>
                            Aún no tienes canciones de{' '}
                            {isSpotify ? 'Spotify' : 'YouTube'}. Agrega tu música
                            o{' '}
                            <Link
                              href={catalogHref}
                              className="text-brand hover:underline"
                            >
                              elige del catálogo
                            </Link>
                            .
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}

          {data && filteredRows.length > PAGE_SIZE && (
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
            source={source}
            onPlaySpotify={(t) =>
              t &&
              setSpotifyPlaying({
                sourceId: t.sourceId,
                title: t.title,
                artist: t.artist,
                imageUrl: t.coverUrl,
              })
            }
          />
        )}
      </div>

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

      {tagTrack && (
        <TagEditor
          trackId={tagTrack.id}
          title={`${tagTrack.title} — ${tagTrack.artist}`}
          style={tagTrack.style}
          onClose={() => setTagTrack(null)}
        />
      )}

      {showImportPlaylist && (
        <PlaylistImportModal
          target="library"
          onClose={() => setShowImportPlaylist(false)}
        />
      )}

      {showYtPlaylist && (
        <YoutubePlaylistModal onClose={() => setShowYtPlaylist(false)} />
      )}

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
