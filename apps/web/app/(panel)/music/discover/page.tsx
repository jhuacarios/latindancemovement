'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type {
  DiscoverFeed,
  StylePreference,
  Track,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, Spinner, StyleBadge } from '@/components/ui';
import { PlayButtons } from '@/components/play-buttons';
import { NewBadge } from '@/components/new-badge';
import { EpicBadge } from '@/components/epic-badge';
import { PlatformIcon } from '@/components/platform-icon';
import {
  formatDuration,
  formatViewsPerDay,
  isNewRelease,
  viewsPerDay,
} from '@/lib/format';

export default function DiscoverPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['discover'],
    queryFn: () => api<DiscoverFeed>('/music/tracks/discover'),
  });

  return (
    <div className="space-y-2.5 lg:space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-3">
          <h1 className="text-base font-bold lg:text-2xl">🔥 Descubre</h1>
          {(user?.role === 'DJ' ||
            user?.role === 'ORGANIZADOR' ||
            user?.role === 'SUPER_ADMIN') && (
            <>
              <Link
                href="/music/discover/nuevas"
                className="rounded-md border border-emerald-700/50 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 transition hover:border-emerald-500 hover:text-emerald-200 lg:px-2 lg:py-1 lg:text-xs"
              >
                Novedades Spotify →
              </Link>
              <Link
                href="/music/discover/nuevas-youtube"
                className="rounded-md border border-red-700/50 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300 transition hover:border-red-500 hover:text-red-200 lg:px-2 lg:py-1 lg:text-xs"
              >
                Novedades YouTube →
              </Link>
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-400 max-lg:hidden">
          Lo nuevo que está sonando en bachata y salsa, ordenado por popularidad
          del momento. Descubre artistas y sus últimos lanzamientos.
        </p>
      </div>

      {isLoading && <Spinner label="Buscando lo nuevo…" />}

      {isError && (
        <Card className="text-sm text-red-300">
          {error instanceof ApiError
            ? error.message
            : 'No se pudo cargar el descubrimiento.'}
        </Card>
      )}

      {/* Móvil: un solo bloque, una lista debajo de la otra. Desde lg: dos
          columnas a mitad y mitad (la preferida queda a la izquierda). */}
      {data && (
        <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start lg:gap-6">
          {orderedSections(data, user?.stylePreference ?? null).map((s) => (
            <DiscoverSection
              key={s.key}
              title={s.title}
              accent={s.accent}
              tracks={s.tracks}
              epicIds={new Set(data.epicIds)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Las dos secciones, ordenadas según la preferencia del usuario: solo si eligió
 * salsa va esa primero. En el resto de los casos (bachata, "me da igual" o
 * todavía sin elegir) manda bachata, que es lo que más se mueve.
 */
function orderedSections(data: DiscoverFeed, pref: StylePreference | null) {
  const sections = [
    {
      key: 'bachata',
      title: 'Bachata — nuevo y sonando',
      accent: 'text-amber-300',
      tracks: data.bachata,
    },
    {
      key: 'salsa',
      title: 'Salsa — nuevo y sonando',
      accent: 'text-red-300',
      tracks: data.salsa,
    },
  ];
  return pref === 'SALSA' ? sections.reverse() : sections;
}

function DiscoverSection({
  title,
  accent,
  tracks,
  epicIds,
}: {
  title: string;
  accent: string;
  tracks: Track[];
  epicIds: Set<string>;
}) {
  return (
    // `min-w-0`: sin esto, como item de grid no puede achicarse por debajo del
    // ancho de su contenido y desborda la pantalla en móvil.
    <section className="min-w-0 space-y-1 lg:space-y-2">
      <h2 className={`text-lg font-semibold ${accent}`}>{title}</h2>
      {tracks.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No hay lanzamientos recientes por ahora.
        </p>
      ) : (
        <div className="space-y-1">
          {tracks.map((t, i) => (
            <DiscoverRow
              key={t.id}
              track={t}
              rank={i + 1}
              epic={epicIds.has(t.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DiscoverRow({
  track: t,
  rank,
  epic,
}: {
  track: Track;
  rank: number;
  epic: boolean;
}) {
  const vpd = viewsPerDay(t.details?.viewCount, t.releaseDate);
  return (
    <div className="flex items-center gap-2 rounded-lg px-0 py-2 transition hover:bg-neutral-800/50 lg:gap-3 lg:px-2">
      <span className="w-4 shrink-0 text-right text-sm text-neutral-500 lg:w-6">
        {rank}
      </span>
      {t.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={t.coverUrl}
          alt=""
          className="h-11 w-16 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded bg-neutral-800 text-sm">
          🎵
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{t.title}</span>
          {isNewRelease(t.releaseDate) && <NewBadge />}
          {epic && <EpicBadge />}
        </div>
        {/* Artista protagonista */}
        <div className="truncate text-sm font-semibold text-brand">
          {t.artist}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StyleBadge style={t.style} />
          {t.substyles.map((s) => (
            <span
              key={s}
              className="rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
            >
              {s}
            </span>
          ))}
          {vpd != null && (
            <span
              title="Reproducciones por día (momentum)"
              className="inline-flex items-center gap-0.5 text-[11px] text-neutral-400"
            >
              🔥 {formatViewsPerDay(t.details?.viewCount, t.releaseDate)}
            </span>
          )}
          <PlatformIcon
            source={t.source}
            className="h-3.5 w-3.5 shrink-0 opacity-70"
          />
          {t.durationSec != null && (
            <span className="text-[11px] text-neutral-500">
              · {formatDuration(t.durationSec)}
            </span>
          )}
        </div>
      </div>
      <span
        className="flex shrink-0 items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <PlayButtons track={t} />
      </span>
    </div>
  );
}
