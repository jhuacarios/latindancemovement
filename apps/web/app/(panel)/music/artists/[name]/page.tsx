'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, Track } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Card, Spinner, StyleBadge } from '@/components/ui';
import { TrackThumb } from '@/components/track-thumb';
import { PlayButtons } from '@/components/play-buttons';
import { SourceLink } from '@/components/source-link';
import { NewBadge } from '@/components/new-badge';
import { formatDuration, formatViews, isNewRelease } from '@/lib/format';
import { useLayoutUI } from '@/lib/layout-ui';

/**
 * Canciones de un artista en el catálogo de YouTube. Se llega tocando un artista
 * en /music/artists. Filtra por artista acreditado (substring del campo `artist`)
 * y ordena por reproducciones (las más sonadas primero).
 */
export default function ArtistTracksPage() {
  const params = useParams<{ name: string }>();
  // El nombre viene URL-encoded en la ruta dinámica.
  const name = decodeURIComponent(params.name ?? '');

  // Ruta dinámica: marca "Artistas" como activo en el menú lateral.
  const { setActiveNavKey } = useLayoutUI();
  useEffect(() => {
    setActiveNavKey('music.artists');
    return () => setActiveNavKey(null);
  }, [setActiveNavKey]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['artist-tracks', name],
    queryFn: () => {
      const p = new URLSearchParams({
        source: 'YOUTUBE',
        artist: name,
        pageSize: '200',
        sortBy: 'views',
        sortDir: 'desc',
      });
      return api<Paginated<Track>>(`/music/tracks?${p.toString()}`);
    },
    enabled: Boolean(name),
  });

  const tracks = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/music/artists"
          className="text-sm text-brand hover:underline"
        >
          ← Volver a Artistas
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          🎤 {name}
        </h1>
        <p className="text-sm text-neutral-400">
          Canciones en el catálogo de YouTube
          {data ? ` · ${tracks.length}` : ''}.
        </p>
      </div>

      {isLoading && <Spinner label="Buscando canciones…" />}

      {isError && (
        <Card className="text-sm text-red-300">
          {error instanceof ApiError
            ? error.message
            : 'No se pudieron cargar las canciones.'}
        </Card>
      )}

      {data && tracks.length === 0 && (
        <p className="text-sm text-neutral-500">
          No hay canciones de este artista en el catálogo de YouTube.
        </p>
      )}

      {tracks.length > 0 && (
        <div className="space-y-1">
          {tracks.map((t, i) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-neutral-800/60 max-lg:gap-1.5"
            >
              <span className="w-6 shrink-0 text-right text-sm text-neutral-500 max-lg:w-4 max-lg:text-xs">
                {i + 1}
              </span>
              <TrackThumb track={t} widthClass="w-16 max-lg:w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-sm font-medium max-lg:text-[13px]">
                    {t.title}
                  </span>
                  {isNewRelease(t.releaseDate) && <NewBadge />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 max-lg:text-[11px]">
                  <span className="lg:hidden">
                    <StyleBadge style={t.style} compact />
                  </span>
                  <span className="hidden lg:inline">
                    <StyleBadge style={t.style} />
                  </span>
                  <span className="truncate">{t.artist}</span>
                  {t.durationSec != null && (
                    <span>· {formatDuration(t.durationSec)}</span>
                  )}
                  {t.details?.viewCount != null && (
                    <span>· {formatViews(t.details.viewCount)} repr.</span>
                  )}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 max-lg:flex-col">
                <PlayButtons track={t} />
                <SourceLink track={t} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
