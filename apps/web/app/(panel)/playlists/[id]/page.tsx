'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Playlist } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Card, Spinner, StyleBadge } from '@/components/ui';

export default function PlaylistDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => api<Playlist>(`/music/playlists/${id}`),
    enabled: !!id,
  });

  return (
    <div className="space-y-5">
      <Link href="/playlists" className="text-sm text-brand hover:underline">
        ← Volver a playlists
      </Link>

      {isLoading && <Spinner />}
      {error && <p className="text-sm text-red-300">No se pudo cargar la playlist.</p>}

      {data && (
        <>
          <div>
            <h1 className="text-2xl font-bold">{data.name}</h1>
            <p className="text-sm text-neutral-400">
              {data.items?.length ?? 0} canciones · estado {data.status}
              {data.targetBachataPct != null &&
                ` · mix objetivo ${data.targetBachataPct}% bachata`}
            </p>
          </div>

          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 text-left text-neutral-400">
                <tr>
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Artista</th>
                  <th className="px-4 py-3">Estilo</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items?.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-neutral-800/60 last:border-0"
                  >
                    <td className="px-4 py-3 text-neutral-500">{item.position}</td>
                    <td className="px-4 py-3 font-medium">
                      {item.track?.title ?? '—'}
                      {item.isWarmup && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
                          warmup
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {item.track?.artist ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {item.track && (
                        <StyleBadge style={item.track.substyle ?? item.track.style} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.track && (
                        <a
                          href={item.track.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:underline"
                        >
                          escuchar ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {(!data.items || data.items.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                      Playlist vacía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
