'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Track,
  YoutubePlaylistDetail,
  YoutubePlaylistVideo,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';
import { PlayButtons } from '@/components/play-buttons';
import { YoutubeIcon } from '@/components/youtube-icon';
import {
  AddVideoToLibraryModal,
  type VideoToAdd,
} from '@/components/add-video-to-library-modal';
import { formatDuration, formatTotalDuration } from '@/lib/format';

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

export default function YoutubePlaylistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [addVideo, setAddVideo] = useState<VideoToAdd | null>(null);
  const [addInCatalog, setAddInCatalog] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['youtube-playlist', id],
    queryFn: () => api<YoutubePlaylistDetail>(`/music/youtube/playlists/${id}`),
    enabled: Boolean(id),
  });

  const items = data?.items ?? [];
  const totalSec = items.reduce((a, v) => a + (v.durationSec ?? 0), 0);
  const durCount = items.filter((v) => v.durationSec != null).length;
  const partialDur = Boolean(data) && durCount < items.length;
  const inLibCount = items.filter((v) => v.match?.inLibrary).length;
  const inCatCount = items.filter((v) => v.match?.inCatalog).length;
  const externalCount = items.filter((v) => !v.match).length;

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

      {isLoading && <Spinner label="Trayendo la playlist…" />}

      {isError && (
        <Card className="text-sm text-red-300">
          {error instanceof ApiError
            ? error.message
            : 'No se pudo traer la playlist.'}
        </Card>
      )}

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
                    className="rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand"
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
                          className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand"
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
    </div>
  );
}
