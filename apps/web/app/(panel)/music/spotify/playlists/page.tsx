'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SpotifyConnectionStatus,
  SpotifyOwnPlaylist,
  SpotifyPlaylistDetail,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';
import { formatDuration } from '@/lib/format';

export default function SpotifyPlaylistsPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['spotify-status'],
    queryFn: () => api<SpotifyConnectionStatus>('/music/spotify/status'),
  });
  const connected = status?.connected ?? false;

  const { data: playlists, isLoading: listLoading } = useQuery({
    queryKey: ['spotify-playlists'],
    queryFn: () => api<SpotifyOwnPlaylist[]>('/music/spotify/playlists'),
    enabled: connected,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['spotify-playlist', selectedId],
    queryFn: () =>
      api<SpotifyPlaylistDetail>(`/music/spotify/playlists/${selectedId}`),
    enabled: connected && !!selectedId,
  });

  const disconnect = useMutation({
    mutationFn: () => api('/music/spotify/connection', { method: 'DELETE' }),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ['spotify-status'] });
      void qc.invalidateQueries({ queryKey: ['spotify-playlists'] });
    },
  });

  async function connect() {
    setErr(null);
    try {
      const { url } = await api<{ url: string }>('/music/spotify/auth-url');
      window.location.href = url;
    } catch (e) {
      setErr(
        e instanceof ApiError ? e.message : 'No se pudo iniciar la conexión.',
      );
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            🟢 Playlists de Spotify
          </h1>
          <p className="text-sm text-neutral-400">
            Conecta tu cuenta de Spotify y revisa tus playlists (con match al
            catálogo).
          </p>
        </div>
        {connected && (
          <Button
            variant="ghost"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            Desconectar Spotify
          </Button>
        )}
      </div>

      {err && <Card className="text-sm text-red-300">{err}</Card>}

      {statusLoading && <Spinner />}

      {!statusLoading && !connected && (
        <Card className="text-center">
          <div className="mb-2 text-4xl">🟢</div>
          <h2 className="text-lg font-semibold">Conecta tu cuenta de Spotify</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-400">
            Para ver tus playlists de Spotify aquí, autoriza el acceso de solo
            lectura a tus playlists.
          </p>
          <div className="mt-4">
            <Button onClick={connect}>🔗 Conectar cuenta de Spotify</Button>
          </div>
        </Card>
      )}

      {connected && !selectedId && (
        <>
          {listLoading && <Spinner />}
          {!listLoading && (playlists?.length ?? 0) === 0 && (
            <p className="text-sm text-neutral-500">
              No se encontraron playlists en tu cuenta.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(playlists ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="text-left"
              >
                <Card className="flex h-full items-center gap-3 transition hover:border-brand/60">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded bg-neutral-800 object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded bg-neutral-800" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-neutral-500">
                      {p.itemCount} canciones · {p.owner}
                    </div>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}

      {connected && selectedId && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="text-sm text-brand hover:underline"
          >
            ← Volver a mis playlists
          </button>

          {detailLoading && <Spinner label="Leyendo la playlist…" />}

          {detail && (
            <>
              <div className="flex items-center gap-3">
                {detail.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detail.imageUrl}
                    alt=""
                    className="h-16 w-16 rounded bg-neutral-800 object-cover"
                  />
                ) : null}
                <div>
                  <h2 className="text-xl font-bold">{detail.name}</h2>
                  <p className="text-sm text-neutral-400">
                    {detail.items.length} canciones ·{' '}
                    {detail.items.filter((i) => i.match?.inCatalog).length} en
                    catálogo ·{' '}
                    {detail.items.filter((i) => i.match?.inLibrary).length} en
                    Mis Canciones ·{' '}
                    {detail.items.filter((i) => !i.match).length} externas
                  </p>
                </div>
              </div>

              <Card className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-800 text-left text-neutral-400">
                    <tr>
                      <th className="px-3 py-3 w-14"></th>
                      <th className="px-4 py-3">Título</th>
                      <th className="px-4 py-3">Artista</th>
                      <th className="px-4 py-3">Duración</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr
                        key={it.sourceId}
                        className="border-b border-neutral-800/60 last:border-0"
                      >
                        <td className="px-3 py-2">
                          {it.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.imageUrl}
                              alt=""
                              loading="lazy"
                              className="h-10 w-10 rounded bg-neutral-800 object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-neutral-800" />
                          )}
                        </td>
                        <td className="px-4 py-2 font-medium">{it.title}</td>
                        <td className="px-4 py-2 text-neutral-300">
                          {it.artist ?? '—'}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-neutral-400">
                          {formatDuration(it.durationSec)}
                        </td>
                        <td className="px-4 py-2">
                          {it.match ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <StyleBadge style={it.match.style} />
                              {it.match.inLibrary ? (
                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                                  En Mis Canciones
                                </span>
                              ) : it.match.inCatalog ? (
                                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300">
                                  En catálogo
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="rounded-full bg-neutral-700/40 px-2 py-0.5 text-xs text-neutral-400">
                              Externa
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir en Spotify"
                            className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
                          >
                            Abrir ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
