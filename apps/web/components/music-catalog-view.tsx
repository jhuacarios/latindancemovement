'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type DanceStyle,
  type ExcelImportResult,
  type LibrarySummary,
  type Paginated,
  type Track,
} from '@baile-latino/types';
import { api, ApiError, downloadFile, uploadFile } from '@/lib/api';
import { useEffectiveRole } from '@/lib/view-as-role';
import { usePermissions } from '@/lib/permissions';
import { useIsMobile } from '@/lib/use-is-mobile';
import { useDebounced } from '@/lib/use-debounce';
import { AddTrackForm, type NewTrackBody } from '@/components/add-track-form';
import { PlayButtons } from '@/components/play-buttons';
import { SearchInput } from '@/components/search-input';
import { StyleFilter } from '@/components/style-filter';
import { TrackThumb } from '@/components/track-thumb';
import {
  formatDuration,
  formatReleaseDate,
  formatViews,
  formatViewsPerDay,
  isNewRelease,
  isWithinLastMonths,
  viewsPerDay,
} from '@/lib/format';
import { NewBadge } from '@/components/new-badge';
import { EpicBadge } from '@/components/epic-badge';
import { buildEpicMatcher } from '@/lib/similarity';
import { useThumbs } from '@/lib/use-thumbs';
import { SourceLink } from '@/components/source-link';
import { EditTrackModal } from '@/components/edit-track-modal';
import { SubstyleFilterMultiSelect } from '@/components/substyle-select';
import { SortTh, nextSort, type SortState } from '@/components/sort-th';
import { PlaylistImportModal } from '@/components/playlist-import-modal';
import { DateManagerModal } from '@/components/date-manager-modal';
import { SpotifyImportModal } from '@/components/spotify-import-modal';
import { SpotifyCatalogImportModal } from '@/components/spotify-catalog-import-modal';
import {
  SpotifyPlayerBar,
  type SpotifyPlayable,
} from '@/components/spotify-player-bar';
import { PlatformIcon } from '@/components/platform-icon';
import { YoutubeIcon } from '@/components/youtube-icon';
import { SpotifyIcon } from '@/components/spotify-icon';
import { DuplicatesModal } from '@/components/duplicates-modal';
import {
  ConfirmDialog,
  type ConfirmOptions,
} from '@/components/confirm-dialog';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';

// Sin paginación por ahora: traemos todo el catálogo de una.
const PAGE_SIZE = 150;
/** Se carga todo lo que matchea búsqueda+estilo (server-side) y se filtra/pagina
 * en cliente, para que búsqueda cubra TODO el catálogo y los filtros calculados
 * (nuevas/épicas/meses) cubran todo lo cargado. */
const LOAD_SIZE = 1000;

/** Columnas que se pueden mostrar/ocultar desde el engranaje. Título y acciones
 * siempre visibles; la miniatura tiene su propio toggle. */
type ColKey =
  | 'artist'
  | 'style'
  | 'duration'
  | 'year'
  | 'views'
  | 'vpd'
  | 'added'
  // Botones de la columna de acciones (se guardan junto a las columnas).
  | 'video'
  | 'source'
  | 'edit';
type ColVis = Record<ColKey, boolean>;

const COLUMN_DEFS: { key: ColKey; label: string; youtubeOnly?: boolean }[] = [
  { key: 'artist', label: 'Artista' },
  { key: 'style', label: 'Estilo' },
  { key: 'duration', label: 'Duración' },
  { key: 'year', label: 'Fecha' },
  { key: 'views', label: 'Reproducciones', youtubeOnly: true },
  { key: 'vpd', label: 'Repr./día', youtubeOnly: true },
  { key: 'added', label: 'Agregado' },
];

/** Botones de la columna de acciones que se pueden mostrar u ocultar. Reproducir,
 *  eliminar y "agregar a mis canciones" no entran: son las acciones principales. */
const ACTION_DEFS: { key: ColKey; label: string; adminOnly?: boolean }[] = [
  { key: 'video', label: 'Ver video' },
  { key: 'source', label: 'Abrir en la plataforma' },
  { key: 'edit', label: 'Editar canción', adminOnly: true },
];

const ALL_COLS_VISIBLE: ColVis = {
  artist: true,
  style: true,
  duration: true,
  year: true,
  views: true,
  vpd: true,
  added: true,
  video: true,
  source: true,
  edit: true,
};

/** En celular no entran todas: se arranca con lo minimo util (titulo va siempre)
 *  y el resto se muestra desde el engranaje, como en escritorio. */
const MOBILE_COLS_VISIBLE: ColVis = {
  artist: true,
  style: true,
  duration: false,
  year: false,
  views: false,
  vpd: false,
  added: false,
  video: false,
  source: false,
  edit: false,
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

  const role = useEffectiveRole();
  const perms = usePermissions();
  const qc = useQueryClient();
  const isAdmin = role === 'SUPER_ADMIN';
  const canEdit = role ? perms.can(role, permKey, 'editar') : false;
  const canDelete = role ? perms.can(role, permKey, 'eliminar') : false;
  const [editTrack, setEditTrack] = useState<Track | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

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
  const [sort, setSort] = useState<SortState>({ by: '', dir: 'asc' });
  const [showForm, setShowForm] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showThumb, toggleThumb] = useThumbs();
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  // Columnas visibles + menú del engranaje. Se guardan por fuente Y por tamaño:
  // móvil y escritorio tienen su propia configuración (claves separadas).
  const isMobile = useIsMobile();
  const colsBaseKey = `nectason.catalogCols.${source}`;
  const colsStorageKey = `${colsBaseKey}.${isMobile ? 'mobile' : 'desktop'}`;
  const [cols, setCols] = useState<ColVis>(ALL_COLS_VISIBLE);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      // En escritorio, si aún no hay config nueva, hereda la de la clave vieja
      // (sin sufijo) para no perder lo que el usuario ya tenía configurado.
      const raw =
        localStorage.getItem(colsStorageKey) ??
        (isMobile ? null : localStorage.getItem(colsBaseKey));
      if (raw) {
        setCols({ ...ALL_COLS_VISIBLE, ...JSON.parse(raw) });
        return;
      }
    } catch {
      /* preferencia inválida: sigue y usa los defaults */
    }
    // Sin nada guardado: en celular arranca con menos columnas. Apenas toque el
    // engranaje se guarda su elección (en la clave de ese tamaño) y manda esa.
    setCols(isMobile ? MOBILE_COLS_VISIBLE : ALL_COLS_VISIBLE);
  }, [colsStorageKey, colsBaseKey, isMobile]);

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
  const [showDates, setShowDates] = useState(false);
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


  // Reproducibilidad de Spotify (restringidas por región): rellena en lotes.
  // Solo en el catálogo de Spotify, admin. Marca el botón de play deshabilitado.
  const playableBackfillRan = useRef(false);
  useEffect(() => {
    if (!isAdmin || !isSpotify || playableBackfillRan.current) return;
    playableBackfillRan.current = true;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 40 && !cancelled; i++) {
        try {
          const r = await api<{ updated: number; remaining: number }>(
            '/music/tracks/spotify/backfill-playable',
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
  }, [isAdmin, isSpotify, qc]);

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

  // Conteo por estilo de TODO el catálogo (no depende de los filtros de la vista).
  const { data: summary } = useQuery({
    queryKey: ['catalog-summary', source],
    queryFn: () =>
      api<LibrarySummary>(`/music/tracks/summary?source=${source}`),
  });

  // La búsqueda se consulta con debounce: el input se ve al instante, pero el
  // request al servidor (sobre TODO el catálogo) se dispara al dejar de escribir.
  const debouncedSearch = useDebounced(search, 300);
  const { data, isLoading, error } = useQuery({
    // Búsqueda/estilo/orden en el server (cubren TODO el catálogo); los
    // sub-estilos/nuevas/épicas/meses se filtran en cliente sobre lo cargado.
    queryKey: ['catalog', source, { search: debouncedSearch, style, sort }],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set('source', source);
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (style) p.set('style', style);
      if (sort.by) {
        p.set('sortBy', sort.by);
        p.set('sortDir', sort.dir);
      }
      p.set('page', '1');
      p.set('pageSize', String(LOAD_SIZE));
      return api<Paginated<Track>>(`/music/tracks?${p.toString()}`);
    },
  });

  // Pill "Épica": top 50 por reproducciones/día de CADA estilo (bachata: últimos
  // 24 meses; salsa: sin restricción), calculado sobre el catálogo de YouTube —
  // la única fuente con reproducciones. Spotify HEREDA la marca cruzando por
  // título+artista+estilo+duración casi iguales (no expone reproducciones).
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
  // Ids de las filas visibles marcadas como Épica: YouTube por sourceId (directo);
  // Spotify heredando de YouTube (título+artista+estilo+duración casi iguales).
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

  // Fecha de lanzamiento: rellena en lotes (Spotify por ID/búsqueda, o subida de
  // YouTube). Se re-dispara cuando aparecen canciones sin fecha (ej. al importar
  // una playlist), no solo al montar. Solo admin (hace llamadas a Spotify).
  const backfillRunning = useRef(false);
  useEffect(() => {
    if (!isAdmin || backfillRunning.current) return;
    // ¿Hay canciones cargadas sin fecha aún? (null = sin procesar por el backfill)
    const needs = data?.data.some((t) => t.releaseDate == null);
    if (!needs) return;
    backfillRunning.current = true;
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
      backfillRunning.current = false;
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, data, qc]);

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

  // Novedades (lanzadas hace ≤ 2 meses): filtro en cliente, consistente con el
  // badge ✨ NUEVO. El catálogo se trae completo, así que no requiere backend.
  const newCount = useMemo(
    () =>
      data ? data.data.filter((t) => isNewRelease(t.releaseDate)).length : 0,
    [data],
  );
  const monthsN = Number(lastMonths) || 0;
  // El pipeline se memoiza para que su resultado sea estable entre renders. Sin
  // esto, `data.data.filter`/`.slice` creaban un array nuevo en CADA render, así
  // que cualquier cambio de estado ajeno a la tabla (abrir el menú del engranaje,
  // un modal, etc.) reconstruía las 250 filas y se sentía el lag.
  const visibleRows = useMemo(
    () =>
      data
        ? data.data.filter(
            (t) =>
              (!onlyNew || isNewRelease(t.releaseDate)) &&
              (!onlyEpic || epicIds.has(t.id)) &&
              (substyles.length === 0 ||
                substyles.some((s) => t.substyles?.includes(s))) &&
              isWithinLastMonths(t.releaseDate, t.year, monthsN),
          )
        : [],
    [data, onlyNew, onlyEpic, epicIds, substyles, monthsN],
  );
  // Orden por Repr./día (calculado en cliente); las sin dato van al final.
  const sortedRows = useMemo(
    () =>
      vpdSort
        ? [...visibleRows].sort((a, b) => {
            const va = viewsPerDay(a.details?.viewCount, a.releaseDate) ?? -1;
            const vb = viewsPerDay(b.details?.viewCount, b.releaseDate) ?? -1;
            return vpdSort === 'desc' ? vb - va : va - vb;
          })
        : visibleRows,
    [visibleRows, vpdSort],
  );
  // Paginación en cliente de a PAGE_SIZE sobre el set filtrado+ordenado.
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedRows, page],
  );

  // Si un filtro/búsqueda deja la página fuera de rango, vuelve a la 1.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pageIds = useMemo(() => pageRows.map((t) => t.id), [pageRows]);
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }
  // Cuenta de columnas visibles (para el colSpan del estado vacío): Título +
  // acciones siempre; el resto según toggles/fuente/selección/miniatura.
  const baseCols =
    3 + // Título + acciones + columna "#"
    (selectMode ? 1 : 0) +
    (showThumb ? 1 : 0) +
    (cols.artist ? 1 : 0) +
    (cols.style ? 1 : 0) +
    (cols.duration ? 1 : 0) +
    (cols.year ? 1 : 0) +
    (!isSpotify && cols.views ? 1 : 0) +
    (!isSpotify && cols.vpd ? 1 : 0) +
    (cols.added ? 1 : 0);


  // Filas memoizadas: como el pipeline (pageRows) ya es estable, esto solo se
  // reconstruye cuando cambia algo que las filas realmente muestran. Abrir el
  // menú de columnas, un modal, etc. (estado que las filas no leen) ya no las
  // reconstruye, así que responde sin lag.
  const rowsEl = useMemo(
    () => pageRows.map((t, i) => (
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
                    <td className="px-1 py-2 lg:px-4 lg:py-3">
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
                  <td className="px-1 py-2 lg:px-4 lg:py-3 font-medium">
                    {t.title}
                    {isNewRelease(t.releaseDate) && <NewBadge />}
                    {epicIds.has(t.id) && <EpicBadge />}
                  </td>
                  {cols.artist && (
                    <td className="px-1 py-2 text-neutral-300 max-lg:w-px lg:px-4 lg:py-3">
                    {t.artist}
                  </td>
                  )}
                  {cols.style && (
                    <td className="px-2 py-2 max-lg:w-px lg:px-4 lg:py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {/* En movil solo la inicial (B/S) para ahorrar ancho. */}
                        <span className="lg:hidden">
                          <StyleBadge style={t.style} compact />
                        </span>
                        <span className="hidden lg:inline">
                          <StyleBadge style={t.style} />
                        </span>
                        {t.substyles?.map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 max-lg:hidden"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  )}
                  {cols.duration && (
                    <td className="px-1 py-2 lg:px-4 lg:py-3 text-neutral-400 tabular-nums">
                      {formatDuration(t.durationSec)}
                    </td>
                  )}
                  {cols.year && (
                    <td className="px-1 py-2 lg:px-4 lg:py-3 whitespace-nowrap text-neutral-400">
                      {formatReleaseDate(t.releaseDate, t.year)}
                    </td>
                  )}
                  {!isSpotify && cols.views && (
                    <td className="px-1 py-2 lg:px-4 lg:py-3 tabular-nums text-neutral-400">
                      {formatViews(t.details?.viewCount)}
                    </td>
                  )}
                  {!isSpotify && cols.vpd && (
                    <td className="px-1 py-2 lg:px-4 lg:py-3 tabular-nums text-neutral-400">
                      {formatViewsPerDay(t.details?.viewCount, t.releaseDate)}
                    </td>
                  )}
                  {cols.added && (
                    <td className="px-1 py-2 lg:px-4 lg:py-3 text-neutral-400">
                      {new Date(t.createdAt).toLocaleDateString('es-CL')}
                    </td>
                  )}
                  <td
                    className="w-px whitespace-nowrap px-2 py-2 text-right lg:px-4 lg:py-3"
                    onClick={() => setActiveRowId(t.id)}
                  >
                    <div className="flex items-center justify-end gap-1 lg:gap-2">
                      <PlayButtons track={t} showVideo={cols.video} />
                      {isSpotify &&
                        (t.spotifyPlayable === false ? (
                          <button
                            type="button"
                            disabled
                            title="No disponible en tu región: Spotify restringe esta canción, no se puede reproducir."
                            aria-label="No disponible en tu región"
                            className="flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-full bg-neutral-800/50 text-xs text-neutral-600"
                          >
                            🚫
                          </button>
                        ) : (
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
                        ))}
                      {cols.source && <SourceLink track={t} />}
                      {canEdit && cols.edit && (
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
                          className="rounded-md bg-neutral-800 px-2 py-1 text-base font-bold leading-none text-red-500 transition hover:bg-red-600/20 hover:text-red-400"
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
                          ✕
                        </button>
                      )}
                      {/* Agregar a mi biblioteca: acción personal, disponible
                          para cualquiera que vea el catálogo (no es editar el
                          catálogo global). */}
                      <button
                        className={
                          'rounded-lg bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300' +
                          (t.inLibrary ? '' : ' hover:bg-emerald-500/25')
                        }
                        disabled={toggle.isPending}
                        title={
                          t.inLibrary
                            ? 'En mis canciones'
                            : 'Agregar a mis canciones'
                        }
                        aria-label={
                          t.inLibrary
                            ? 'En mis canciones'
                            : 'Agregar a mis canciones'
                        }
                        onClick={() => toggle.mutate(t)}
                      >
                        {/* En móvil solo el símbolo; el texto vuelve en escritorio. */}
                        {t.inLibrary ? (
                          <>
                            ✓<span className="max-lg:hidden"> En mis canciones</span>
                          </>
                        ) : (
                          <>
                            +<span className="max-lg:hidden"> Agregar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              )),
    // Nota: se depende de `toggle.isPending` (primitivo), NO de `toggle`/
    // `removeTrack` completos: React Query recrea esos objetos en cada render, lo
    // que haría recomputar esto siempre. Sus `.mutate` sí son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageRows, page, cols, showThumb, selectMode, selected, activeRowId, epicIds, isSpotify, spotifyPlaying, canEdit, canDelete, toggle.isPending],
  );

  return (
    <div className="space-y-2.5 lg:space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div className="shrink-0">
          <h1 className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold lg:gap-2 lg:text-2xl">
            <PlatformIcon
              source={source}
              className="h-3.5 w-3.5 shrink-0 lg:h-6 lg:w-6"
            />{' '}
            Catálogo
            <span className="hidden text-sm font-normal text-neutral-500 lg:inline">
              ({isSpotify ? 'Spotify' : 'YouTube'})
            </span>
          </h1>
          {!isAdmin && (
            <p className="text-[11px] text-neutral-400 lg:text-sm">
              Agrégalas a Mis Canciones
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 max-lg:[&_button]:px-2 max-lg:[&_button]:py-1 max-lg:[&_button]:text-[11px] lg:gap-2">
          {canEdit && (
            <Button
              variant="ghost"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            >
              {selectMode ? (
                'Cancelar selección'
              ) : (
                <>
                  <span className="max-lg:hidden">☑ </span>Seleccionar
                </>
              )}
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cerrar' : '+ Nueva canción al catálogo'}
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
                <span className="flex items-center gap-2">
                  <SpotifyIcon className="h-4 w-4" />
                  Importar playlist Spotify
                </span>
              </Button>
              <Button variant="ghost" onClick={() => setShowDates(true)}>
                <span className="max-lg:hidden">🗓 </span>Actualizar fechas
              </Button>
              <span className="text-xs text-neutral-500">
                o agrega una por “+ Nueva canción al catálogo” con su link.
              </span>
            </div>
            {showDates && (
              <DateManagerModal
                source="SPOTIFY"
                onClose={() => setShowDates(false)}
              />
            )}
          </Card>
        ) : (
          <AdminImportExport />
        ))}

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
                onClick={() => setLastMonths('')}
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
            onClick={() => setOnlyNew((v) => !v)}
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
            onClick={() => setOnlyEpic((v) => !v)}
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
            🔥 Solo épicas{epicIds.size > 0 ? ` (${epicIds.size})` : ''}
          </button>
        </div>
      </Card>

      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudo cargar el catálogo.</p>}

      {data && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-[11px] lg:min-w-[720px] lg:text-sm">
            {/* `whitespace-nowrap` se hereda a los th: evita que un titulo se parta en
                dos lineas y duplique el alto; `[&_th]` baja solo el encabezado. */}
            <thead className="whitespace-nowrap border-b border-neutral-800 text-left text-neutral-400 [&_th]:py-1">
              <tr>
                {selectMode && (
                  <th className="w-10 px-1 py-2 lg:px-4">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-brand)]"
                      checked={allSelected}
                      onChange={toggleAll}
                      title="Seleccionar todo"
                    />
                  </th>
                )}
                {/* Numeracion: en movil casi sin aire lateral. */}
                <th className="w-6 px-0.5 py-2 text-right tabular-nums lg:w-10 lg:px-4">
                  #
                </th>
                {showThumb && <th className="w-20 px-1 py-2 lg:px-3"></th>}
                {/* `max-lg:w-full`: en móvil Título reclama TODO el ancho sobrante,
                    dejando a las demás en su mínimo (ver Mis Canciones). */}
                <SortTh
                  label="Título"
                  col="title"
                  primary="asc"
                  sort={sort}
                  onSort={onSort}
                  className="max-lg:w-full"
                />
                {cols.artist && (
                  <SortTh
                    label="Artista"
                    col="artist"
                    primary="asc"
                    sort={sort}
                    onSort={onSort}
                    className="max-lg:w-px"
                  />
                )}
                {cols.style && (
                  // `max-lg:w-px`: en móvil la columna ocupa lo mínimo (solo la B/S)
                  // en vez de llevarse parte del ancho sobrante de la tabla.
                  <th className="px-2 py-2 max-lg:w-px lg:px-4">Estilo</th>
                )}
                {cols.duration && <th className="px-1 py-2 lg:px-4">Duración</th>}
                {cols.year && (
                  <SortTh label={isSpotify ? 'Fecha' : 'Fecha subida'} col="releaseDate" primary="desc" sort={sort} onSort={onSort} />
                )}
                {!isSpotify && cols.views && (
                  <SortTh label="Reproducciones" col="views" primary="desc" sort={sort} onSort={onSort} />
                )}
                {!isSpotify && cols.vpd && (
                  <th
                    className="cursor-pointer select-none px-4 py-2 hover:text-neutral-200"
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
                        {vpdSort === 'desc' ? '▼' : vpdSort === 'asc' ? '▲' : '↕'}
                      </span>
                    </span>
                  </th>
                )}
                {cols.added && (
                  <SortTh label="Agregado" col="createdAt" primary="desc" sort={sort} onSort={onSort} />
                )}
                <th className="w-px px-4 py-2 text-right">
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
                            {c.key === 'year' && !isSpotify
                              ? 'Fecha subida'
                              : c.label}
                          </label>
                        ))}

                        <p className="mt-1 border-t border-neutral-800 px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          Acciones
                        </p>
                        {ACTION_DEFS.filter((a) => !a.adminOnly || canEdit).map(
                          (a) => (
                            <label
                              key={a.key}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                            >
                              <input
                                type="checkbox"
                                checked={cols[a.key]}
                                onChange={() => toggleCol(a.key)}
                                className="accent-[var(--color-brand)]"
                              />
                              {a.key === 'source'
                                ? `Abrir en ${isSpotify ? 'Spotify' : 'YouTube'}`
                                : a.label}
                            </label>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsEl}
              {visibleRows.length === 0 && (
                <tr>
                  <td
                    colSpan={baseCols}
                    className="px-4 py-10 text-center text-neutral-500"
                  >
                    {onlyEpic
                      ? 'No hay canciones épicas con estos filtros.'
                      : onlyNew
                      ? 'No hay canciones lanzadas en los últimos 2 meses.'
                      : isSpotify
                        ? 'El catálogo de Spotify está vacío. Agrega canciones con su link de Spotify.'
                        : 'El catálogo está vacío.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {data && sortedRows.length > PAGE_SIZE && (
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
  const [showDates, setShowDates] = useState(false);
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
    <Card className="max-lg:p-2.5">
      {/* La variante apunta a los botones de adentro: en móvil van chicos sin
          repetir las clases en cada uno. */}
      <div className="flex flex-wrap items-center gap-1.5 max-lg:[&_button]:px-2 max-lg:[&_button]:py-1 max-lg:[&_button]:text-[11px] lg:gap-2">
        <span className="mr-2 text-[11px] font-semibold lg:text-sm">
          Gestión<span className="max-lg:hidden"> del catálogo</span>:
        </span>
        <Button
          variant="ghost"
          onClick={() =>
            downloadFile('/music/tracks/template.xlsx', 'plantilla-canciones.xlsx')
          }
        >
          <span className="max-lg:hidden">⬇ </span>Plantilla
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
          {uploading ? (
            'Importando…'
          ) : (
            <>
              <span className="max-lg:hidden">⬆ </span>Importar Excel
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={() => downloadFile('/music/tracks/export.xlsx', 'canciones.xlsx')}
        >
          <span className="max-lg:hidden">⬇ </span>Exportar
        </Button>
        <Button
          variant="ghost"
          disabled={backfilling}
          onClick={onBackfill}
          title="Completa la duración faltante de las canciones del catálogo desde YouTube"
        >
          {backfilling ? (
            'Completando…'
          ) : (
            <>
              <span className="max-lg:hidden">⏱ </span>Completar duraciones
            </>
          )}
        </Button>
        <Button variant="ghost" onClick={() => setShowDates(true)}>
          🗓 Actualizar fechas
        </Button>
        <Button variant="ghost" onClick={() => setShowDuplicates(true)}>
          <span className="max-lg:hidden">🔎 </span>Buscar duplicados
        </Button>
        <Button onClick={() => setShowPlaylist(true)}>
          <span className="flex items-center gap-2">
            <YoutubeIcon className="h-4 w-4 text-[#FF0000] max-lg:hidden" />
            Importar playlist YouTube
          </span>
        </Button>
        <Button onClick={() => setShowSpotify(true)}>
          <span className="flex items-center gap-2">
            <SpotifyIcon className="h-4 w-4 max-lg:hidden" />
            Importar playlist Spotify
          </span>
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
      {showDates && (
        <DateManagerModal source="YOUTUBE" onClose={() => setShowDates(false)} />
      )}
    </Card>
  );
}
