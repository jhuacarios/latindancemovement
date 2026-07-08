'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DanceStyle, Paginated, Tag, Track } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Input, Spinner, StyleBadge } from './ui';
import { PlatformIcon } from './platform-icon';
import { TrackThumb } from './track-thumb';
import { usePlayer } from './player';
import { clsx } from './clsx';
import { isNewRelease, isWithinLastMonths, viewsPerDay } from '@/lib/format';
import { buildEpicMatcher } from '@/lib/similarity';
import { NewBadge } from './new-badge';
import { EpicBadge } from './epic-badge';

/**
 * Panel lateral de "Mis Canciones": busca en la biblioteca del usuario y permite
 * arrastrar canciones hacia la playlist que se está editando.
 */
export function LibraryDrawer({
  excludeTrackIds,
  onClose,
  onItemDragStart,
  onItemDragEnd,
  onAddTrack,
  platform = 'YOUTUBE',
  onPlaySpotify,
  playingSpotifyId,
}: {
  /** Canciones ya en la playlist (se excluyen de la lista). */
  excludeTrackIds: Set<string>;
  /** Plataforma de la playlist: solo ofrece canciones de esa fuente. */
  platform?: 'YOUTUBE' | 'SPOTIFY';
  onClose: () => void;
  onItemDragStart: (trackId: string, fromCatalog: boolean) => void;
  onItemDragEnd: () => void;
  /** Doble click en una canción: agregar al final de la playlist. */
  onAddTrack?: (trackId: string, fromCatalog: boolean) => void;
  /** Click en una canción de Spotify: gatilla el reproductor de Spotify. */
  onPlaySpotify?: (track: Track) => void;
  /** sourceId de la canción de Spotify que suena (para resaltarla). */
  playingSpotifyId?: string | null;
}) {
  // Fuente: mi biblioteca o el catálogo global.
  const [source, setSource] = useState<'mine' | 'catalog'>('mine');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [style, setStyle] = useState<DanceStyle | ''>('');
  const [substyles, setSubstyles] = useState<string[]>([]);
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyEpic, setOnlyEpic] = useState(false);
  const fromCatalog = source === 'catalog';
  const player = usePlayer();
  const qc = useQueryClient();
  // Distingue click (reproducir) de doble click (agregar): el click espera un
  // pelín por si viene un segundo click.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Al abrir, pone al día los tags personales (hereda los del catálogo en las
  // canciones que aún no tienen), para que el filtro por tags funcione. Idempotente.
  useEffect(() => {
    let cancelled = false;
    api<{ seeded: number }>('/music/library/backfill-tags', { method: 'POST' })
      .then((r) => {
        if (!cancelled && r.seeded > 0) {
          qc.invalidateQueries({ queryKey: ['library-drawer'] });
          qc.invalidateQueries({ queryKey: ['tags-vocab'] });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [qc]);

  // Vocabulario de sub-estilos (para los tags activables del estilo elegido).
  const { data: vocab } = useQuery({
    queryKey: ['tags-vocab'],
    queryFn: () => api<Tag[]>('/music/tags'),
  });
  const substyleOptions = useMemo(
    () =>
      style
        ? (vocab ?? []).filter((t) => t.style === style).map((t) => t.name)
        : [],
    [vocab, style],
  );

  // Al cambiar de estilo, el mismo botón lo desactiva (vuelve a "todos").
  function selectStyle(s: DanceStyle) {
    setStyle((prev) => (prev === s ? '' : s));
    setSubstyles([]);
  }
  function toggleSubstyle(name: string) {
    setSubstyles((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  // Con los filtros calculados (Nuevas/Épicas) se carga todo el set para que el
  // filtro cubra el catálogo completo, no solo los primeros resultados.
  const pageSize = onlyNew || onlyEpic ? 1000 : 50;
  const { data, isLoading } = useQuery({
    queryKey: [
      'library-drawer',
      platform,
      source,
      debounced,
      style,
      substyles,
      pageSize,
    ],
    queryFn: () => {
      const p = new URLSearchParams({
        pageSize: String(pageSize),
        sort: 'recent',
      });
      p.set('source', platform);
      if (debounced) p.set('search', debounced);
      if (style) p.set('style', style);
      if (source === 'mine') {
        // Mi biblioteca: filtra por mis tags personales (multi).
        if (substyles.length) p.set('substyles', substyles.join(','));
        return api<Paginated<Track>>(`/music/library?${p.toString()}`);
      }
      // Catálogo global: filtra por sub-estilo del catálogo (uno) y excluye en
      // el servidor lo que ya está en Mi biblioteca (paginación correcta).
      if (substyles.length) p.set('substyle', substyles[0]);
      p.set('excludeMine', 'true');
      return api<Paginated<Track>>(`/music/tracks?${p.toString()}`);
    },
  });

  // Excluye las que ya están en la playlist. (En modo catálogo, las que ya están
  // en Mi biblioteca las excluye el servidor con excludeMine.)
  const items = useMemo(
    () => (data?.data ?? []).filter((t) => !excludeTrackIds.has(t.id)),
    [data, excludeTrackIds],
  );

  // Épicas: se calculan sobre el catálogo de YouTube (la única fuente con
  // reproducciones); Spotify hereda por título+artista+estilo+duración.
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
    if (platform === 'SPOTIFY') {
      const match = buildEpicMatcher(epicYt);
      return new Set(items.filter(match).map((r) => r.id));
    }
    const ytSourceIds = new Set(epicYt.map((t) => t.sourceId));
    return new Set(
      items.filter((r) => ytSourceIds.has(r.sourceId)).map((r) => r.id),
    );
  }, [items, epicYt, platform]);

  // Filtros cliente por Nueva / Épica (el epicIds se calcula sobre todo `items`).
  const visibleItems = useMemo(
    () =>
      items.filter(
        (t) =>
          (!onlyNew || isNewRelease(t.releaseDate)) &&
          (!onlyEpic || epicIds.has(t.id)),
      ),
    [items, onlyNew, onlyEpic, epicIds],
  );

  return (
    <aside className="sticky top-0 flex max-h-[calc(100vh-7rem)] w-80 shrink-0 flex-col rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <PlatformIcon source={platform} className="h-4 w-4 shrink-0" />
          Agregar de {platform === 'SPOTIFY' ? 'Spotify' : 'YouTube'}
        </h3>
        <button
          onClick={onClose}
          title="Cerrar"
          className="rounded-md bg-neutral-800 px-2 py-0.5 text-sm hover:bg-neutral-700"
        >
          ✕
        </button>
      </div>

      <div className="border-b border-neutral-800 p-2">
        {/* Fuente: mi biblioteca o el catálogo. Al agregar del catálogo, la
            canción también queda en Mis Canciones. */}
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-neutral-800/60 p-0.5">
          {(['mine', 'catalog'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              title={
                s === 'mine'
                  ? 'Las canciones de tu biblioteca (Mis Canciones).'
                  : 'Canciones del catálogo que aún no tienes en Mis Canciones. Al agregar una, también se suma a Mis Canciones.'
              }
              className={clsx(
                'rounded-md py-1 text-xs font-medium transition',
                source === s
                  ? 'bg-brand text-white'
                  : 'text-neutral-300 hover:bg-neutral-700/60',
              )}
            >
              {s === 'mine' ? 'Mis Canciones' : 'Catálogo'}
            </button>
          ))}
        </div>

        <div className="relative">
          <Input
            placeholder={
              fromCatalog ? 'Buscar en el catálogo…' : 'Buscar en mis canciones…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={search ? 'pr-8' : undefined}
          />
          {search && (
            <button
              type="button"
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Switch de estilo: bachata primero. Vuelve a "todos" al re-tocar. */}
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-neutral-800/60 p-0.5">
          {(['BACHATA', 'SALSA'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectStyle(s)}
              className={clsx(
                'rounded-md py-1 text-xs font-medium transition',
                style === s
                  ? 'bg-brand text-white'
                  : 'text-neutral-300 hover:bg-neutral-700/60',
              )}
            >
              {s === 'BACHATA' ? 'Bachata' : 'Salsa'}
            </button>
          ))}
        </div>

        {/* Filtros por Nueva / Épica. */}
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={() => setOnlyNew((v) => !v)}
            title="Solo canciones nuevas (lanzadas hace 2 meses o menos)"
            className={clsx(
              'flex-1 rounded-md border py-1 text-xs font-medium transition',
              onlyNew
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800',
            )}
          >
            ✨ Nuevas
          </button>
          <button
            type="button"
            onClick={() => setOnlyEpic((v) => !v)}
            title="Solo Épicas (top reproducciones/día por estilo)"
            className={clsx(
              'flex-1 rounded-md border py-1 text-xs font-medium transition',
              onlyEpic
                ? 'border-purple-500/60 bg-purple-500/15 text-purple-300'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800',
            )}
          >
            🔥 Épicas
          </button>
        </div>

        {/* Tags de sub-estilos del estilo elegido (activables, multi). */}
        {style && (
          <div className="mt-2 flex flex-wrap gap-1">
            {substyleOptions.length === 0 && (
              <span className="text-[11px] text-neutral-500">
                Sin sub-estilos en el vocabulario.
              </span>
            )}
            {substyleOptions.map((name) => {
              const active = substyles.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleSubstyle(name)}
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[11px] transition',
                    active
                      ? 'bg-brand/20 text-brand'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-2 px-1 text-[11px] text-neutral-500">
          Click reproduce · doble click agrega al final · o arrastra a la
          playlist.
          {fromCatalog && ' Al agregar del catálogo, también va a Mis Canciones.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && <Spinner />}
        {!isLoading && visibleItems.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-neutral-500">
            {onlyNew || onlyEpic
              ? 'Ninguna coincide con los filtros (Nuevas/Épicas).'
              : debounced
                ? 'Sin resultados.'
                : fromCatalog
                  ? 'Ya tienes en Mis Canciones todo el catálogo con estos filtros.'
                  : 'No hay canciones disponibles para agregar.'}
          </p>
        )}
        <div className="flex flex-col gap-1">
          {visibleItems.map((t) => {
            const isPlaying =
              player.playingKey === `${t.source}:${t.sourceId}` ||
              (t.source === 'SPOTIFY' && t.sourceId === playingSpotifyId);
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => onItemDragStart(t.id, fromCatalog)}
                onDragEnd={onItemDragEnd}
                onClick={() => {
                  // Click: reproducir abajo (esperando por si es doble click).
                  if (clickTimer.current) clearTimeout(clickTimer.current);
                  clickTimer.current = setTimeout(() => {
                    clickTimer.current = null;
                    if (t.source === 'SPOTIFY') onPlaySpotify?.(t);
                    else if (player.canPlay(t)) player.playAudio(t);
                  }, 220);
                }}
                onDoubleClick={() => {
                  if (clickTimer.current) {
                    clearTimeout(clickTimer.current);
                    clickTimer.current = null;
                  }
                  onAddTrack?.(t.id, fromCatalog);
                }}
                title={
                  onAddTrack
                    ? 'Click para reproducir · doble click para agregar al final'
                    : 'Click para reproducir'
                }
                className={clsx(
                  'flex cursor-pointer select-none items-center gap-2 rounded-lg border border-transparent p-1.5 transition hover:border-neutral-700 hover:bg-neutral-800/60 active:cursor-grabbing',
                  isPlaying && 'bg-brand/15',
                )}
              >
                <span className="shrink-0">
                  <TrackThumb track={t} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center">
                    <span className="truncate text-xs font-medium">
                      {t.title}
                    </span>
                    {isNewRelease(t.releaseDate) && <NewBadge />}
                    {epicIds.has(t.id) && <EpicBadge />}
                  </div>
                  <div className="truncate text-[11px] text-neutral-500">
                    {t.artist}
                  </div>
                </div>
                <StyleBadge style={t.style} compact />
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
