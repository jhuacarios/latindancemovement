'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { DiscoverCandidate } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Card, Spinner, StyleBadge } from '@/components/ui';
import { useLayoutUI } from '@/lib/layout-ui';

export default function DiscoverCandidatesPage() {
  const { setActiveNavKey } = useLayoutUI();
  useEffect(() => {
    setActiveNavKey('music.discover');
    return () => setActiveNavKey(null);
  }, [setActiveNavKey]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['discover-candidates'],
    queryFn: () => api<DiscoverCandidate[]>('/music/tracks/discover-candidates'),
    // Es pesado (llama a Spotify); no re-fetch al enfocar.
    refetchOnWindowFocus: false,
    staleTime: 60 * 60 * 1000,
  });

  const bachata = (data ?? []).filter((c) => c.style === 'BACHATA');
  const salsa = (data ?? []).filter((c) => c.style === 'SALSA');

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">🆕 Novedades fuera del catálogo</h1>
          <Link
            href="/music/discover"
            className="text-sm text-brand hover:underline"
          >
            ← Volver a Descubre
          </Link>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400">
          Lanzamientos recientes en Spotify de los artistas que ya tienes en el
          catálogo, que <b className="text-neutral-200">aún no están</b> cargados.
          Son sugerencias para curar — no entran solas. Solo se lee metadata
          pública (no se descarga audio).
        </p>
      </div>

      {isLoading && (
        <Spinner label="Buscando novedades en Spotify… (puede tardar unos segundos)" />
      )}

      {isError && (
        <Card className="text-sm text-red-300">
          {error instanceof ApiError
            ? error.message
            : 'No se pudieron traer las novedades.'}
        </Card>
      )}

      {data && data.length === 0 && (
        <p className="text-sm text-neutral-500">
          No encontramos lanzamientos nuevos de tus artistas fuera del catálogo.
        </p>
      )}

      {data && data.length > 0 && (
        <>
          <CandidateSection
            title="Bachata"
            accent="text-amber-300"
            items={bachata}
          />
          <CandidateSection title="Salsa" accent="text-red-300" items={salsa} />
        </>
      )}
    </div>
  );
}

function CandidateSection({
  title,
  accent,
  items,
}: {
  title: string;
  accent: string;
  items: DiscoverCandidate[];
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
          <CandidateCard key={c.spotifyTrackId} c={c} />
        ))}
      </div>
    </section>
  );
}

function CandidateCard({ c }: { c: DiscoverCandidate }) {
  return (
    <Card className="flex gap-3 p-3">
      {c.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.coverUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-neutral-800 text-2xl">
          🎵
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.title}</div>
        <div className="truncate text-sm font-semibold text-brand">
          {c.artist}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StyleBadge style={c.style} />
          {c.albumType !== 'single' && (
            <span className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-neutral-400">
              {c.albumType}
            </span>
          )}
          <span className="text-[11px] text-neutral-500">· {c.releaseDate}</span>
        </div>
        <div className="mt-1 truncate text-[11px] text-neutral-500">
          Por tu artista: {c.seedArtist}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-700/50 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 transition hover:border-emerald-500 hover:text-emerald-200"
          >
            Ver en Spotify ↗
          </a>
          {c.previewUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio src={c.previewUrl} controls preload="none" className="h-7" />
          )}
        </div>
      </div>
    </Card>
  );
}
