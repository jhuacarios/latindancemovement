'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Track, YoutubeDiscoverCandidate } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Card, Spinner, StyleBadge } from '@/components/ui';
import { PlayButtons } from '@/components/play-buttons';
import {
  AddVideoToLibraryModal,
  type VideoToAdd,
} from '@/components/add-video-to-library-modal';
import { useLayoutUI } from '@/lib/layout-ui';
import { useEffectiveRole } from '@/lib/view-as-role';
import { formatDuration } from '@/lib/format';

const CONF_CLASS: Record<string, string> = {
  alta: 'bg-emerald-500/15 text-emerald-300',
  media: 'bg-amber-500/15 text-amber-300',
  baja: 'bg-neutral-700/40 text-neutral-400',
};

/** Track mínimo para el reproductor a partir de un candidato de YouTube. */
function toPlayTrack(c: YoutubeDiscoverCandidate): Track {
  return {
    id: c.videoId,
    title: c.title,
    artist: c.channelTitle,
    style: c.proposedStyle ?? 'BACHATA',
    substyles: [],
    year: null,
    source: 'YOUTUBE',
    sourceId: c.videoId,
    url: c.url,
    coverUrl: c.thumbnailUrl,
    durationSec: null,
    isRelease: false,
    approvalStatus: 'APROBADA',
    scope: 'CATALOG',
    ownerId: null,
    artistUserId: null,
    createdById: '',
    createdAt: '',
    updatedAt: '',
    details: null,
  };
}

export default function DiscoverYoutubePage() {
  const { setActiveNavKey } = useLayoutUI();
  useEffect(() => {
    setActiveNavKey('music.discover');
    return () => setActiveNavKey(null);
  }, [setActiveNavKey]);

  // Ids ya agregados en esta sesión (para ocultarlos al instante).
  const [added, setAdded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['discover-youtube'],
    queryFn: () =>
      api<YoutubeDiscoverCandidate[]>('/music/tracks/discover-youtube'),
    refetchOnWindowFocus: false,
    staleTime: 60 * 60 * 1000,
  });

  const visible = (data ?? []).filter((c) => !added.has(c.videoId));
  const bachata = visible.filter((c) => c.proposedStyle === 'BACHATA');
  const salsa = visible.filter((c) => c.proposedStyle === 'SALSA');
  const revisar = visible.filter((c) => c.proposedStyle == null);

  const markAdded = (videoId: string) =>
    setAdded((prev) => new Set(prev).add(videoId));

  return (
    <div className="space-y-3 lg:space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold leading-none">
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 px-2.5 py-1 text-xs font-extrabold uppercase leading-none tracking-wider text-white shadow-[0_0_14px_rgba(236,72,153,0.75)]">
              ✨ Nuevo
            </span>
            <span className="leading-none">
              Novedades en YouTube
              <span className="hidden lg:inline"> (por canal)</span>
            </span>
          </h1>
          <Link
            href="/music/discover"
            className="text-sm text-brand hover:underline"
          >
            ← Volver a Descubre
          </Link>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400 max-lg:hidden">
          Subidas recientes de los canales de tus artistas del catálogo, que{' '}
          <b className="text-neutral-200">aún no están</b> cargadas. El estilo es
          una <b className="text-neutral-200">propuesta</b> (por el texto del
          video o heredado del canal) — nada entra al catálogo hasta que tú lo
          agregues.
        </p>
      </div>

      {isLoading && (
        <Spinner label="Buscando en los canales de YouTube… (puede tardar unos segundos)" />
      )}

      {isError && (
        <Card className="text-sm text-red-300">
          {error instanceof ApiError
            ? error.message
            : 'No se pudieron traer las novedades.'}
        </Card>
      )}

      {data && visible.length === 0 && (
        <p className="text-sm text-neutral-500">
          No hay subidas nuevas fuera del catálogo.
        </p>
      )}

      {visible.length > 0 && (
        <>
          <Section
            title="Bachata"
            accent="text-amber-300"
            items={bachata}
            onAdded={markAdded}
          />
          <Section
            title="Salsa"
            accent="text-red-300"
            items={salsa}
            onAdded={markAdded}
          />
          <Section
            title="Por revisar"
            accent="text-neutral-300"
            items={revisar}
            onAdded={markAdded}
          />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  accent,
  items,
  onAdded,
}: {
  title: string;
  accent: string;
  items: YoutubeDiscoverCandidate[];
  onAdded: (videoId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className={`text-lg font-semibold ${accent}`}>
        {title}{' '}
        <span className="text-sm font-normal text-neutral-500">
          ({items.length})
        </span>
      </h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <CandidateCard key={c.videoId} c={c} onAdded={onAdded} />
        ))}
      </div>
    </section>
  );
}

function CandidateCard({
  c,
  onAdded,
}: {
  c: YoutubeDiscoverCandidate;
  onAdded: (videoId: string) => void;
}) {
  const qc = useQueryClient();
  const isAdmin = useEffectiveRole() === 'SUPER_ADMIN';
  const [showAdd, setShowAdd] = useState(false);

  const videoToAdd: VideoToAdd = {
    videoId: c.videoId,
    title: c.title,
    channelTitle: c.channelTitle,
    thumbnailUrl: c.thumbnailUrl,
  };

  return (
    <Card className="flex gap-3 p-3">
      {c.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.thumbnailUrl}
          alt=""
          className="h-16 w-24 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded bg-neutral-800 text-2xl">
          📺
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.title}</div>
        <div className="truncate text-sm text-neutral-400">{c.channelTitle}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {c.proposedStyle ? (
            <StyleBadge style={c.proposedStyle} />
          ) : (
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
              sin estilo
            </span>
          )}
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
              CONF_CLASS[c.confidence] ?? CONF_CLASS.baja
            }`}
            title={c.reason}
          >
            {c.confidence}
          </span>
          <span className="text-[11px] text-neutral-500">
            · {c.publishedAt.slice(0, 10)}
          </span>
          {c.durationSec != null && (
            <span className="text-[11px] text-neutral-500">
              · {formatDuration(c.durationSec)}
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-[11px] text-neutral-500">
          {c.reason}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <PlayButtons track={toPlayTrack(c)} />
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            title={
              isAdmin ? 'Agregar al catálogo o a mis canciones' : 'Agregar a mis canciones'
            }
            className="rounded-md border border-sky-700/60 bg-sky-500/10 px-2 py-1 text-xs text-sky-300 transition hover:border-sky-500 hover:text-sky-200"
          >
            {isAdmin ? '+ Catálogo' : '+ Mis Canciones'}
          </button>
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-red-700/50 bg-red-500/10 px-2 py-1 text-xs text-red-300 transition hover:border-red-500 hover:text-red-200"
          >
            YouTube ↗
          </a>
        </div>
      </div>

      {showAdd && (
        <AddVideoToLibraryModal
          video={videoToAdd}
          source="YOUTUBE"
          startInCatalog={isAdmin}
          defaultStyle={c.proposedStyle ?? undefined}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            onAdded(c.videoId);
            void qc.invalidateQueries({ queryKey: ['catalog'] });
          }}
        />
      )}
    </Card>
  );
}
