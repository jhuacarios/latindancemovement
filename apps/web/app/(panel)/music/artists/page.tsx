'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ArtistSummary } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Card, Spinner, StyleBadge } from '@/components/ui';

/** minúsculas sin acentos, para buscar. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export default function ArtistsPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['artists'],
    queryFn: () => api<ArtistSummary[]>('/music/tracks/artists'),
  });

  const filtered = useMemo(() => {
    const all = data ?? [];
    const nq = norm(q.trim());
    return nq ? all.filter((a) => norm(a.name).includes(nq)) : all;
  }, [data, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🎤 Artistas</h1>
        <p className="text-sm text-neutral-400">
          Artistas de bachata y salsa del catálogo, ordenados por nombre.
        </p>
      </div>

      {isLoading && <Spinner label="Cargando artistas…" />}

      {isError && (
        <Card className="text-sm text-red-300">
          {error instanceof ApiError
            ? error.message
            : 'No se pudieron cargar los artistas.'}
        </Card>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar artista…"
              className="w-full max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <span className="text-sm text-neutral-500">
              {filtered.length}
              {filtered.length === 1 ? ' artista' : ' artistas'}
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin resultados.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((a) => (
                <div
                  key={a.name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-medium">{a.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {a.styles.map((s) => (
                      <StyleBadge key={s} style={s} compact />
                    ))}
                    <span className="text-xs text-neutral-500">
                      {a.trackCount}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
