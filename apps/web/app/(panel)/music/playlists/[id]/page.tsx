'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Paginated,
  Playlist,
  PlaylistItem,
  Track,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, DeleteIconButton, Input, Spinner, StyleBadge } from '@/components/ui';
import { PlayButtons } from '@/components/play-buttons';
import { TrackThumb } from '@/components/track-thumb';
import { SourceLink } from '@/components/source-link';
import {
  SpotifyPlayerBar,
  type SpotifyPlayable,
} from '@/components/spotify-player-bar';
import { PlatformIcon } from '@/components/platform-icon';
import { SpotifyIcon } from '@/components/spotify-icon';
import { SpotifyCopyTracksModal } from '@/components/spotify-copy-tracks-modal';
import { YoutubeIcon } from '@/components/youtube-icon';
import { YoutubeFromTemplateModal } from '@/components/youtube-from-template-modal';
import { LibraryDrawer } from '@/components/library-drawer';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { clsx } from '@/components/clsx';
import {
  formatDuration,
  formatReleaseDate,
  formatViews,
  formatViewsPerDay,
  isNewRelease,
  isWithinLastMonths,
  viewsPerDay,
} from '@/lib/format';
import { buildEpicMatcher } from '@/lib/similarity';
import { NewBadge } from '@/components/new-badge';
import { EpicBadge } from '@/components/epic-badge';
import { useLayoutUI } from '@/lib/layout-ui';
import { useIsMobile } from '@/lib/use-is-mobile';

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

/** Columnas mostrables/ocultables (# , miniatura, Título y acciones principales
 *  —reproducir y quitar— son fijas). */
type ColKey =
  | 'artist'
  | 'style'
  | 'duration'
  | 'date'
  | 'views'
  | 'vpd'
  // Botones de la columna de acciones que se pueden mostrar u ocultar.
  | 'video'
  | 'source';
type ColVis = Record<ColKey, boolean>;

const COLUMN_DEFS: { key: ColKey; label: string; youtubeOnly?: boolean }[] = [
  { key: 'artist', label: 'Artista' },
  { key: 'style', label: 'Estilo' },
  { key: 'duration', label: 'Duración' },
  { key: 'date', label: 'Fecha' },
  { key: 'views', label: 'Reproducciones', youtubeOnly: true },
  { key: 'vpd', label: 'Repr./día', youtubeOnly: true },
];

/** Botones de acción configurables (reproducir y quitar van siempre). */
const ACTION_DEFS: { key: ColKey; label: string }[] = [
  { key: 'video', label: 'Ver video' },
  { key: 'source', label: 'Abrir en la plataforma' },
];

const ALL_COLS_VISIBLE: ColVis = {
  artist: true,
  style: true,
  duration: true,
  date: true,
  views: true,
  vpd: true,
  video: true,
  source: true,
};

/** En celular no entran todas: se arranca con lo mínimo (Título va siempre) y el
 *  resto se activa desde el engranaje. */
const MOBILE_COLS_VISIBLE: ColVis = {
  artist: true,
  style: true,
  duration: false,
  date: false,
  views: false,
  vpd: false,
  video: false,
  source: false,
};

export default function PlaylistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { setCollapsed, setActiveNavKey } = useLayoutUI();
  const [ytOpen, setYtOpen] = useState(false);
  const [spExportOpen, setSpExportOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Orden local (para arrastrar-soltar con respuesta inmediata).
  const [localItems, setLocalItems] = useState<PlaylistItem[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // Canción arrastrada desde el panel de Mis Canciones (para agregar).
  const [externalDragId, setExternalDragId] = useState<string | null>(null);
  // Si la arrastrada/agregada viene del catálogo (para sumarla a Mis Canciones).
  const [externalFromCatalog, setExternalFromCatalog] = useState(false);
  const [dropTarget, setDropTarget] = useState<DropSide>(null);
  // Editor de distribución (N bachatas / M salsas por bloque). null = cerrado.
  const [distForm, setDistForm] = useState<{ n: number; m: number } | null>(null);
  // Reproductor de Spotify (barra inferior) para canciones de Spotify.
  const [spotifyPlaying, setSpotifyPlaying] = useState<SpotifyPlayable | null>(
    null,
  );
  // De dónde se disparó: 'playlist' (la tabla) o 'drawer' (el buscador).
  const [playingFrom, setPlayingFrom] = useState<'playlist' | 'drawer' | null>(
    null,
  );
  function playSpotify(t: NonNullable<PlaylistItem['track']>, from: 'playlist' | 'drawer') {
    if (spotifyPlaying?.sourceId === t.sourceId && playingFrom === from) {
      setSpotifyPlaying(null);
      setPlayingFrom(null);
      return;
    }
    setSpotifyPlaying({
      sourceId: t.sourceId,
      title: t.title,
      artist: t.artist,
      imageUrl: t.coverUrl,
    });
    setPlayingFrom(from);
  }

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

  // Marca la subsección correcta en el menú (Playlists Internas de Spotify o
  // YouTube): esta ruta es compartida y solo aquí sabemos la plataforma.
  useEffect(() => {
    if (!data) return;
    setActiveNavKey(
      data.source === 'SPOTIFY'
        ? 'music.spotify.internalplaylists'
        : 'music.youtube.playlists',
    );
    return () => setActiveNavKey(null);
  }, [data, setActiveNavKey]);

  const items = localItems ?? data?.items ?? [];
  const isSpotify = data?.source === 'SPOTIFY';
  const ytCount = items.filter((i) => i.track?.source === 'YOUTUBE').length;
  const spCount = items.filter((i) => i.track?.source === 'SPOTIFY').length;
  const inPlaylistIds = useMemo(
    () => new Set(items.map((i) => i.trackId)),
    [items],
  );

  // Épicas: top 50 rep/día por estilo del catálogo de YouTube; Spotify hereda
  // por título+artista+estilo+duración. Marca las canciones de la playlist.
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
  const epicIds = useMemo(() => {
    const tracks = items.map((i) => i.track).filter(Boolean) as Track[];
    const spMatch = buildEpicMatcher(epicYt);
    const ytSourceIds = new Set(epicYt.map((t) => t.sourceId));
    const ids = new Set<string>();
    for (const t of tracks) {
      const epic =
        t.source === 'YOUTUBE' ? ytSourceIds.has(t.sourceId) : spMatch(t);
      if (epic) ids.add(t.id);
    }
    return ids;
  }, [items, epicYt]);

  // Columnas visibles + menú del engranaje. Se guardan por fuente Y por tamaño:
  // móvil y escritorio tienen su propia configuración (claves separadas).
  const isMobile = useIsMobile();
  const [cols, setCols] = useState<ColVis>(ALL_COLS_VISIBLE);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const colsBaseKey = data?.source
    ? `nectason.playlistCols.${data.source}`
    : null;
  const colsStorageKey = colsBaseKey
    ? `${colsBaseKey}.${isMobile ? 'mobile' : 'desktop'}`
    : null;
  useEffect(() => {
    if (!colsStorageKey || !colsBaseKey) return;
    try {
      // En escritorio, si no hay config nueva, hereda la clave vieja (sin sufijo).
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
    setCols(isMobile ? MOBILE_COLS_VISIBLE : ALL_COLS_VISIBLE);
  }, [colsStorageKey, colsBaseKey, isMobile]);
  function toggleCol(key: ColKey) {
    setCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        if (colsStorageKey) localStorage.setItem(colsStorageKey, JSON.stringify(next));
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
  const baseCols =
    4 +
    (cols.artist ? 1 : 0) +
    (cols.style ? 1 : 0) +
    (cols.duration ? 1 : 0) +
    (cols.date ? 1 : 0) +
    (!isSpotify && cols.views ? 1 : 0) +
    (!isSpotify && cols.vpd ? 1 : 0);

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
    mutationFn: async (args: {
      trackId: string;
      target: DropSide;
      fromCatalog?: boolean;
    }) => {
      // Si viene del catálogo, primero la sumo a Mis Canciones (idempotente).
      if (args.fromCatalog) {
        try {
          await api('/music/library', {
            method: 'POST',
            body: { trackId: args.trackId },
          });
        } catch {
          /* ya estaba en mi biblioteca u otro error no bloqueante */
        }
      }
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
      void qc.invalidateQueries({ queryKey: ['library-drawer'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
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
    // Sin distribución configurada: abre el editor para definirla primero.
    if (n + m === 0) {
      setDistForm({ n: 5, m: 3 });
      return;
    }
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

    // Soltada desde el panel de Mis Canciones / Catálogo: agregar.
    if (externalDragId) {
      const tid = externalDragId;
      const fromCat = externalFromCatalog;
      setExternalDragId(null);
      setExternalFromCatalog(false);
      addTrack.mutate({ trackId: tid, target, fromCatalog: fromCat });
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

  // Reordenar una posición (para móvil, donde el drag táctil no funciona).
  // Reusa el mismo patrón optimista que el drag.
  function moveItem(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    const arr = [...items];
    const [m] = arr.splice(index, 1);
    arr.splice(to, 0, m);
    setLocalItems(arr); // optimista
    reorder.mutate(arr.map((i) => i.id));
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
      <Link
        href={
          isSpotify ? '/music/spotify/internal-playlists' : '/music/playlists'
        }
        className="text-sm text-brand hover:underline"
      >
        ← Volver a Playlists Internas ({isSpotify ? 'Spotify' : 'YouTube'})
      </Link>

      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudo cargar la playlist.</p>}

      {data && (
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <PlatformIcon
                  source={data.source}
                  className="h-6 w-6 shrink-0"
                />
                {data.name}
                <span className="text-sm font-normal text-neutral-500">
                  ({isSpotify ? 'Spotify' : 'YouTube'})
                </span>
              </h1>
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
            <div className="flex w-full flex-wrap justify-end gap-1.5 max-lg:[&_button]:px-2 max-lg:[&_button]:py-1 max-lg:[&_button]:text-xs lg:gap-2">
              {items.length > 1 &&
                (() => {
                  const n = data.bachatasPerBlock ?? 0;
                  const m = data.salsasPerBlock ?? 0;
                  const hasDist = n + m > 0;
                  return (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => applyBlockOrder(false)}
                        disabled={reorder.isPending}
                        title={
                          hasDist
                            ? `Reordena en bloques de ${n} bachatas → ${m} salsas; los sobrantes van al final`
                            : 'Define una distribución por bloque para reordenar'
                        }
                      >
                        🧱 Ordenar en bloques{hasDist ? ` (${n}/${m})` : ''}
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
                  );
                })()}
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
              {data.source !== 'SPOTIFY' && (
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
              )}
              {data.source === 'SPOTIFY' && (
                <Button
                  variant="ghost"
                  disabled={spCount === 0}
                  title={
                    spCount === 0
                      ? 'No hay canciones de Spotify en esta playlist'
                      : 'Copiar las canciones para pegarlas en una playlist de Spotify (escritorio)'
                  }
                  onClick={() => setSpExportOpen(true)}
                >
                  <span className="flex items-center gap-2">
                    <SpotifyIcon className="h-4 w-4" />
                    Copiar para Spotify
                  </span>
                </Button>
              )}
            </div>
          </div>

          {err && <Card className="text-sm text-red-300">{err}</Card>}

          {items.length > 1 && (
            <p className="text-xs text-neutral-500">
              <span className="max-lg:hidden">Arrastra una fila para reordenar</span>
              <span className="lg:hidden">Usa ▲▼ para reordenar</span>
              {drawerOpen && ', o arrastra canciones desde el panel para agregarlas'}
              .
            </p>
          )}

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-[11px] lg:min-w-[720px] lg:text-sm">
              <thead className="whitespace-nowrap border-b border-neutral-800 text-left text-neutral-400 [&_th]:py-1">
                <tr>
                  <th className="w-6 px-0.5 py-2 text-right lg:w-12 lg:px-4 lg:py-3">#</th>
                  <th className="w-10 px-1 py-2 lg:w-16 lg:px-3"></th>
                  <th className="px-1 py-2 max-lg:w-full lg:px-4 lg:py-3">Título</th>
                  {cols.artist && (
                    <th className="px-1 py-2 max-lg:w-px lg:px-4 lg:py-3">Artista</th>
                  )}
                  {cols.style && (
                    <th className="px-1 py-2 max-lg:w-px lg:px-4 lg:py-3">Estilo</th>
                  )}
                  {cols.duration && <th className="px-1 py-2 lg:px-4 lg:py-3">Duración</th>}
                  {cols.date && (
                    <th className="px-1 py-2 lg:px-4 lg:py-3">
                      {isSpotify ? 'Fecha' : 'Fecha subida'}
                    </th>
                  )}
                  {!isSpotify && cols.views && (
                    <th className="px-1 py-2 lg:px-4 lg:py-3">Reproducciones</th>
                  )}
                  {!isSpotify && cols.vpd && (
                    <th className="px-1 py-2 lg:px-4 lg:py-3">Repr./día</th>
                  )}
                  <th className="px-1 py-2 lg:px-4 lg:py-3 text-right">
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

                          <p className="mt-1 border-t border-neutral-800 px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            Acciones
                          </p>
                          {ACTION_DEFS.map((a) => (
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
                          ))}
                        </div>
                      )}
                    </div>
                  </th>
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
                      playingFrom === 'playlist' &&
                        spotifyPlaying?.sourceId === item.track?.sourceId
                        ? 'bg-brand/20'
                        : 'hover:bg-brand/5',
                    )}
                  >
                    <td className="px-0.5 py-2 text-right text-neutral-500 lg:px-4 lg:py-3">{idx + 1}</td>
                    <td className="px-1 py-2 lg:px-3">
                      {item.track && <TrackThumb track={item.track} />}
                    </td>
                    <td className="px-1 py-2 lg:px-4 lg:py-3 font-medium">
                      {item.track?.title ?? '—'}
                      {item.track && isNewRelease(item.track.releaseDate) && (
                        <NewBadge />
                      )}
                      {item.track && epicIds.has(item.track.id) && <EpicBadge />}
                      {item.isWarmup && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
                          warmup
                        </span>
                      )}
                    </td>
                    {cols.artist && (
                      <td className="px-1 py-2 text-neutral-300 max-lg:w-px lg:px-4 lg:py-3">
                        {item.track?.artist ?? '—'}
                      </td>
                    )}
                    {cols.style && (
                      <td className="px-1 py-2 max-lg:w-px lg:px-4 lg:py-3">
                        {item.track && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="lg:hidden">
                              <StyleBadge style={item.track.style} compact />
                            </span>
                            <span className="hidden lg:inline">
                              <StyleBadge style={item.track.style} />
                            </span>
                            {item.track.substyles?.map((s) => (
                              <span
                                key={s}
                                className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 max-lg:hidden"
                              >
                                {s}
                              </span>
                            ))}
                            {item.track.tags?.map((tag) => (
                              <span
                                key={tag.id}
                                className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300 max-lg:hidden"
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                    {cols.duration && (
                      <td className="px-1 py-2 lg:px-4 lg:py-3 tabular-nums text-neutral-400">
                        {formatDuration(item.track?.durationSec)}
                      </td>
                    )}
                    {cols.date && (
                      <td className="whitespace-nowrap px-1 py-2 lg:px-4 lg:py-3 text-neutral-400">
                        {formatReleaseDate(
                          item.track?.releaseDate,
                          item.track?.year,
                        )}
                      </td>
                    )}
                    {!isSpotify && cols.views && (
                      <td className="px-1 py-2 lg:px-4 lg:py-3 tabular-nums text-neutral-400">
                        {formatViews(item.track?.details?.viewCount)}
                      </td>
                    )}
                    {!isSpotify && cols.vpd && (
                      <td className="px-1 py-2 lg:px-4 lg:py-3 tabular-nums text-neutral-400">
                        {formatViewsPerDay(
                          item.track?.details?.viewCount,
                          item.track?.releaseDate,
                        )}
                      </td>
                    )}
                    <td className="px-1 py-2 lg:px-4 lg:py-3 text-right">
                      <div className="flex items-center justify-end gap-1 lg:gap-2">
                        {/* Reordenar en móvil (el arrastre táctil no funciona). */}
                        <div className="flex flex-col lg:hidden">
                          <button
                            type="button"
                            title="Subir"
                            aria-label="Subir"
                            disabled={idx === 0 || reorder.isPending}
                            onClick={() => moveItem(idx, -1)}
                            className="flex h-4 w-6 items-center justify-center rounded text-[10px] leading-none text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            title="Bajar"
                            aria-label="Bajar"
                            disabled={idx === items.length - 1 || reorder.isPending}
                            onClick={() => moveItem(idx, 1)}
                            className="flex h-4 w-6 items-center justify-center rounded text-[10px] leading-none text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </div>
                        {item.track && (
                          <PlayButtons track={item.track} showVideo={cols.video} />
                        )}
                        {item.track?.source === 'SPOTIFY' && (
                          <button
                            type="button"
                            title={
                              spotifyPlaying?.sourceId === item.track.sourceId
                                ? 'Detener'
                                : 'Reproducir (Spotify)'
                            }
                            aria-label="Reproducir"
                            onClick={() => playSpotify(item.track!, 'playlist')}
                            className={
                              'flex h-7 w-7 items-center justify-center rounded-full text-xs transition ' +
                              (playingFrom === 'playlist' &&
                              spotifyPlaying?.sourceId === item.track.sourceId
                                ? 'bg-brand text-white'
                                : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700')
                            }
                          >
                            {playingFrom === 'playlist' &&
                            spotifyPlaying?.sourceId === item.track.sourceId
                              ? '⏸'
                              : '▶'}
                          </button>
                        )}
                        {cols.source && item.track && (
                          <SourceLink track={item.track} />
                        )}
                        <DeleteIconButton
                          disabled={removeItem.isPending}
                          title="Quitar de la playlist"
                          aria-label="Quitar de la playlist"
                          onClick={() => confirmRemove(item)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={baseCols}
                      onDragOver={(e) => externalDragId && e.preventDefault()}
                      onDrop={(e) => {
                        if (!externalDragId) return;
                        e.preventDefault();
                        const tid = externalDragId;
                        const fromCat = externalFromCatalog;
                        setExternalDragId(null);
                        setExternalFromCatalog(false);
                        addTrack.mutate({
                          trackId: tid,
                          target: null,
                          fromCatalog: fromCat,
                        });
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
              platform={data.source}
              onClose={() => setDrawerOpen(false)}
              onItemDragStart={(tid, fromCat) => {
                setExternalDragId(tid);
                setExternalFromCatalog(fromCat);
              }}
              onItemDragEnd={() => {
                setExternalDragId(null);
                setExternalFromCatalog(false);
                setDropTarget(null);
              }}
              onAddTrack={(tid, fromCat) =>
                addTrack.mutate({ trackId: tid, target: null, fromCatalog: fromCat })
              }
              onPlaySpotify={(t) => playSpotify(t, 'drawer')}
              playingSpotifyId={
                playingFrom === 'drawer' ? (spotifyPlaying?.sourceId ?? null) : null
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

      {spExportOpen && data && (
        <SpotifyCopyTracksModal
          playlistName={data.name}
          tracks={items
            .filter((i) => i.track?.source === 'SPOTIFY' && i.track.sourceId)
            .map((i) => ({
              sourceId: i.track!.sourceId,
              title: i.track!.title,
              artist: i.track!.artist,
            }))}
          onClose={() => setSpExportOpen(false)}
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

      {spotifyPlaying && (
        <>
          <div className="h-24" />
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-800 bg-neutral-900/95 p-3 backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <SpotifyPlayerBar
                track={spotifyPlaying}
                onClose={() => {
                  setSpotifyPlaying(null);
                  setPlayingFrom(null);
                }}
              />
            </div>
          </div>
        </>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
