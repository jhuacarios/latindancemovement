'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Paginated,
  Track,
  YoutubePlaylistDetail,
  YoutubePlaylistVideo,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';
import { PlayButtons } from '@/components/play-buttons';
import { YoutubeIcon } from '@/components/youtube-icon';
import { NewBadge } from '@/components/new-badge';
import { EpicBadge } from '@/components/epic-badge';
import {
  AddVideoToLibraryModal,
  type VideoToAdd,
} from '@/components/add-video-to-library-modal';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import {
  formatDuration,
  formatTotalDuration,
  isNewRelease,
  isWithinLastMonths,
  viewsPerDay,
} from '@/lib/format';
import { normalizeForMatch } from '@/lib/similarity';
import { useLayoutUI } from '@/lib/layout-ui';

const PRIVACY_LABEL: Record<string, string> = {
  public: 'Pública',
  unlisted: 'Oculta',
  private: 'Privada',
};

/**
 * Construye un Track mínimo (con lo que el reproductor necesita) a partir de un
 * video de la playlist, tenga match o no. El reproductor solo usa
 * source/sourceId/id/details; el resto se rellena para satisfacer el tipo.
 */
function toPlayTrack(v: YoutubePlaylistVideo): Track {
  const m = v.match;
  return {
    id: m?.trackId ?? '',
    title: v.title,
    artist: v.channelTitle,
    style: m?.style ?? 'BACHATA',
    substyles: m?.substyles ?? [],
    year: m?.year ?? null,
    source: 'YOUTUBE',
    sourceId: v.videoId,
    url: v.url,
    coverUrl: v.thumbnailUrl,
    durationSec: v.durationSec,
    isRelease: false,
    approvalStatus: m?.approvalStatus ?? 'APROBADA',
    scope: m?.inCatalog ? 'CATALOG' : 'PERSONAL',
    ownerId: null,
    artistUserId: null,
    createdById: '',
    createdAt: '',
    updatedAt: '',
    details:
      m?.embeddable == null
        ? null
        : ({ embeddable: m.embeddable } as Track['details']),
  };
}

/** Separa un string de artistas ("Romeo Santos, Prince Royce") en nombres sueltos. */
function splitArtists(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/,|&|\/| feat\.?| ft\.?| featuring |\bvs\.?\b| x /i)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Normaliza un nombre de artista para agrupar (minúsculas, sin acentos). */
function normArtist(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function YoutubePlaylistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [addVideo, setAddVideo] = useState<VideoToAdd | null>(null);
  const [addInCatalog, setAddInCatalog] = useState(false);

  // Ruta dinámica: marca "Playlists YouTube" como activo en el menú lateral.
  const { setActiveNavKey } = useLayoutUI();
  useEffect(() => {
    setActiveNavKey('music.youtube.ytplaylists');
    return () => setActiveNavKey(null);
  }, [setActiveNavKey]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['youtube-playlist', id],
    queryFn: () => api<YoutubePlaylistDetail>(`/music/youtube/playlists/${id}`),
    enabled: Boolean(id),
  });

  // Épicas: top 50 rep/día por estilo del catálogo de YouTube (mismo cálculo que
  // Mis Canciones/Catálogo). Como los videos matchean por videoId = sourceId,
  // marca directo por sourceId. Comparte queryKey → reusa la caché de esas vistas.
  const { data: epicData } = useQuery({
    queryKey: ['catalog-epic', 'YOUTUBE'],
    queryFn: () =>
      api<Paginated<Track>>('/music/tracks?source=YOUTUBE&pageSize=1000'),
  });
  const epicSourceIds = useMemo(() => {
    const all = epicData?.data ?? [];
    const out = new Set<string>();
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
      for (const x of top) out.add(x.t.sourceId);
    }
    return out;
  }, [epicData]);

  const items = data?.items ?? [];
  const totalSec = items.reduce((a, v) => a + (v.durationSec ?? 0), 0);
  const durCount = items.filter((v) => v.durationSec != null).length;
  const partialDur = Boolean(data) && durCount < items.length;
  const inLibCount = items.filter((v) => v.match?.inLibrary).length;
  const inCatCount = items.filter((v) => v.match?.inCatalog).length;
  const externalCount = items.filter((v) => !v.match).length;
  const bachataCount = items.filter((v) =>
    v.match?.style?.startsWith('BACHATA'),
  ).length;
  const salsaCount = items.filter((v) =>
    v.match?.style?.startsWith('SALSA'),
  ).length;

  // Artistas / grupos / DJs presentes y en qué % de las canciones aparece cada
  // uno. SOLO se usa el artista real que la app tiene en el catálogo/biblioteca
  // (match.artist); las externas (sin match) no aportan artista — no se adivina
  // desde el título/canal (ahí venían nombres de canciones). Una canción con
  // varios artistas cuenta para cada uno (los % pueden sumar >100).
  const [showAllArtists, setShowAllArtists] = useState(false);
  const artistStats = useMemo(() => {
    const total = items.length;
    if (!total) return [];
    const map = new Map<string, { name: string; count: number }>();
    for (const v of items) {
      const raw = v.match?.artist ?? '';
      if (!raw) continue;
      const titleKey = normalizeForMatch(v.title);
      const seen = new Set<string>();
      for (const n of splitArtists(raw)) {
        const key = normArtist(n);
        if (!key || seen.has(key)) continue;
        // Guarda extra: si el "artista" es igual al título de la canción (ficha
        // mal cargada), se descarta.
        if (normalizeForMatch(n) === titleKey) continue;
        seen.add(key);
        const cur = map.get(key);
        if (cur) cur.count += 1;
        else map.set(key, { name: n, count: 1 });
      }
    }
    return [...map.values()]
      .map((a) => ({ ...a, pct: Math.round((a.count / total) * 100) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [items]);

  function invalidateAfterLibraryChange() {
    void qc.invalidateQueries({ queryKey: ['youtube-playlist', id] });
    void qc.invalidateQueries({ queryKey: ['library'] });
    void qc.invalidateQueries({ queryKey: ['library-summary'] });
    void qc.invalidateQueries({ queryKey: ['catalog'] });
  }

  // Agregar a Mis Canciones una canción que YA existe en el catálogo (por id).
  const addToLibrary = useMutation({
    mutationFn: (trackId: string) =>
      api('/music/library', { method: 'POST', body: { trackId } }),
    onSuccess: invalidateAfterLibraryChange,
  });

  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Quita un video de la playlist REAL de YouTube (no borra el video ni el catálogo).
  const removeFromPlaylist = useMutation({
    mutationFn: (playlistItemId: string) =>
      api(`/music/youtube/playlists/${id}/items/${playlistItemId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setErr(null);
      void qc.invalidateQueries({ queryKey: ['youtube-playlist', id] });
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo quitar el video.'),
  });

  function confirmRemove(v: YoutubePlaylistVideo) {
    setConfirm({
      title: 'Quitar de la playlist',
      danger: true,
      confirmLabel: 'Quitar',
      message: (
        <>
          ¿Quitar <b className="text-neutral-100">{v.title}</b> de tu playlist de
          YouTube? Se elimina del listado real en tu cuenta de YouTube (no borra
          el video ni la canción del catálogo).
          <span className="mt-2 block text-xs text-amber-300/80">
            💡 Si la estás reproduciendo en la app de YouTube, evita borrar la
            canción que suena justo después (reinicia la lista). Borra las que
            están 2 o más posiciones adelante.
          </span>
        </>
      ),
      onConfirm: () => removeFromPlaylist.mutate(v.playlistItemId),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/music/youtube-playlists"
          className="text-sm text-brand hover:underline"
        >
          ← Volver a Playlists YouTube
        </Link>
      </div>

      {err && <Card className="text-sm text-red-300">{err}</Card>}

      {isLoading && <Spinner label="Trayendo la playlist…" />}

      {isError &&
        (() => {
          const msg =
            error instanceof ApiError
              ? error.message
              : 'No se pudo traer la playlist.';
          const quota = /cuota/i.test(msg);
          return (
            <Card
              className={
                quota
                  ? 'border-amber-500/40 bg-amber-500/10 text-sm text-amber-200/90'
                  : 'text-sm text-red-300'
              }
            >
              {quota ? '⚠️ ' : ''}
              {msg}
            </Card>
          );
        })()}

      {data && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-4">
              {data.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.thumbnailUrl}
                  alt=""
                  className="h-24 w-40 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-3xl">
                  📺
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-bold">{data.title}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
                  <span>
                    {data.itemCount} {data.itemCount === 1 ? 'video' : 'videos'}
                  </span>
                  {totalSec > 0 && (
                    <span
                      title={
                        partialDur
                          ? `Suma de ${durCount} de ${items.length} canciones con duración conocida`
                          : 'Duración total'
                      }
                    >
                      · {formatTotalDuration(totalSec)}
                      {partialDur && '+'}
                    </span>
                  )}
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px]">
                    {PRIVACY_LABEL[data.privacyStatus] ?? data.privacyStatus}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    title="En tus Mis Canciones"
                    className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
                  >
                    {inLibCount} en Mis Canciones
                  </span>
                  <span
                    title="En el catálogo global"
                    className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300"
                  >
                    {inCatCount} en Catálogo
                  </span>
                  <span
                    title="No están en el sistema"
                    className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                  >
                    {externalCount} externas
                  </span>
                </div>
                {data.description && (
                  <p className="mt-2 max-w-2xl whitespace-pre-line text-sm text-neutral-400">
                    {data.description}
                  </p>
                )}
              </div>
            </div>

            <a href={data.url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost">
                <span className="flex items-center gap-2">
                  <YoutubeIcon className="h-4 w-4 text-[#FF0000]" />
                  Ver en YouTube
                </span>
              </Button>
            </a>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
              <span className="text-2xl font-bold text-amber-300">
                {bachataCount}
              </span>
              <span className="text-sm text-neutral-300">Bachatas</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
              <span className="text-2xl font-bold text-red-300">
                {salsaCount}
              </span>
              <span className="text-sm text-neutral-300">Salsas</span>
            </div>
          </div>

          {artistStats.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Artistas · grupos · DJs presentes ({artistStats.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(showAllArtists ? artistStats : artistStats.slice(0, 14)).map(
                  (a) => (
                    <span
                      key={a.name}
                      title={`${a.name}: en ${a.count} de ${items.length} ${
                        items.length === 1 ? 'canción' : 'canciones'
                      }`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200"
                    >
                      {a.name}
                      <span className="text-[11px] font-semibold text-emerald-300">
                        {a.pct}%
                      </span>
                    </span>
                  ),
                )}
                {artistStats.length > 14 && (
                  <button
                    type="button"
                    onClick={() => setShowAllArtists((s) => !s)}
                    className="rounded-full bg-neutral-800/60 px-2.5 py-1 text-xs text-neutral-400 transition hover:text-neutral-200"
                  >
                    {showAllArtists
                      ? 'Ver menos'
                      : `+${artistStats.length - 14} más`}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1">
            {data.items.length === 0 && (
              <p className="text-sm text-neutral-500">
                Esta playlist no tiene videos.
              </p>
            )}
            {data.items.map((v, i) => (
              <a
                key={`${v.videoId}-${i}`}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-neutral-800/60"
              >
                <span className="w-6 shrink-0 text-right text-sm text-neutral-500">
                  {i + 1}
                </span>
                {v.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.thumbnailUrl}
                    alt=""
                    className="h-10 w-16 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-neutral-800 text-sm">
                    ▶
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{v.title}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {[
                      v.channelTitle,
                      v.durationSec != null ? formatDuration(v.durationSec) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {v.match && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StyleBadge style={v.match.style} />
                      {isNewRelease(v.match.releaseDate) && <NewBadge />}
                      {epicSourceIds.has(v.videoId) && <EpicBadge />}
                      {v.match.substyles.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
                        >
                          {s}
                        </span>
                      ))}
                      {v.match.year != null && (
                        <span className="text-[11px] text-neutral-500">
                          · {v.match.year}
                        </span>
                      )}
                      {v.match.inCatalog && (
                        <span
                          title="Existe en el catálogo"
                          className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300"
                        >
                          En Catálogo
                        </span>
                      )}
                      {v.match.inLibrary && (
                        <span
                          title="En tus Mis Canciones"
                          className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300"
                        >
                          En Mis Canciones
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span
                  className="flex shrink-0 items-center gap-1 text-sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <PlayButtons track={toPlayTrack(v)} />
                  {!v.match?.inLibrary && (
                    <button
                      type="button"
                      title="Agregar a Mis Canciones"
                      disabled={addToLibrary.isPending}
                      onClick={() => {
                        if (v.match) {
                          // Ya está en el catálogo: solo la agrego a mi biblioteca.
                          addToLibrary.mutate(v.match.trackId);
                        } else {
                          // Externa: abro el modal para crearla como personal.
                          setAddInCatalog(false);
                          setAddVideo({
                            videoId: v.videoId,
                            title: v.title,
                            channelTitle: v.channelTitle,
                            thumbnailUrl: v.thumbnailUrl,
                          });
                        }
                      }}
                      className="rounded-md border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-xs text-neutral-300 transition hover:border-brand hover:text-brand disabled:opacity-50"
                    >
                      + Mis Canciones
                    </button>
                  )}
                  {!v.match && isSuperAdmin && (
                    <button
                      type="button"
                      title="Agregar al Catálogo (global)"
                      onClick={() => {
                        setAddInCatalog(true);
                        setAddVideo({
                          videoId: v.videoId,
                          title: v.title,
                          channelTitle: v.channelTitle,
                          thumbnailUrl: v.thumbnailUrl,
                        });
                      }}
                      className="rounded-md border border-sky-700/60 bg-sky-500/10 px-2 py-1 text-xs text-sky-300 transition hover:border-sky-500 hover:text-sky-200"
                    >
                      + Catálogo
                    </button>
                  )}
                  <button
                    type="button"
                    title="Quitar de la playlist de YouTube"
                    aria-label="Quitar de la playlist de YouTube"
                    disabled={removeFromPlaylist.isPending}
                    onClick={() => confirmRemove(v)}
                    className="rounded-md border border-red-700/50 bg-red-500/10 px-2 py-1 text-sm font-bold leading-none text-red-400 transition hover:border-red-500 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      {addVideo && (
        <AddVideoToLibraryModal
          video={addVideo}
          startInCatalog={addInCatalog}
          onClose={() => setAddVideo(null)}
          onAdded={invalidateAfterLibraryChange}
        />
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
