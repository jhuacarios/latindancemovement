'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SpotifyConnectionStatus,
  SpotifyOwnPlaylist,
  SpotifyPlaylistDetail,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { clsx } from '@/components/clsx';
import { formatDuration } from '@/lib/format';
import { LoadingBar } from '@/components/loading-bar';
import { SpotifyIcon } from '@/components/spotify-icon';
import {
  SpotifyPlayerBar,
  type SpotifyPlayable,
} from '@/components/spotify-player-bar';
import {
  AddVideoToLibraryModal,
  type VideoToAdd,
} from '@/components/add-video-to-library-modal';

export default function SpotifyPlaylistsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [addTrack, setAddTrack] = useState<VideoToAdd | null>(null);
  const [addInCatalog, setAddInCatalog] = useState(false);
  // Canción sonando en el reproductor de Spotify (barra inferior).
  const [playing, setPlaying] = useState<SpotifyPlayable | null>(null);
  // Selección múltiple + confirmación de borrado.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

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

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailIsError,
    error: detailError,
  } = useQuery({
    queryKey: ['spotify-playlist', selectedId],
    queryFn: () =>
      api<SpotifyPlaylistDetail>(`/music/spotify/playlists/${selectedId}`),
    enabled: connected && !!selectedId,
    retry: 1,
  });

  const disconnect = useMutation({
    mutationFn: () => api('/music/spotify/connection', { method: 'DELETE' }),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ['spotify-status'] });
      void qc.invalidateQueries({ queryKey: ['spotify-playlists'] });
    },
  });

  function invalidateAfterChange() {
    void qc.invalidateQueries({ queryKey: ['spotify-playlist', selectedId] });
    void qc.invalidateQueries({ queryKey: ['library'] });
    void qc.invalidateQueries({ queryKey: ['library-summary'] });
    void qc.invalidateQueries({ queryKey: ['catalog'] });
  }

  const del = useMutation({
    mutationFn: async (ids: string[]) => {
      let failed = 0;
      for (const id of ids) {
        try {
          await api(`/music/spotify/playlists/${id}`, { method: 'DELETE' });
        } catch {
          failed++;
        }
      }
      return failed;
    },
    onSuccess: async (failed) => {
      setSelected(new Set());
      setSelectMode(false);
      await qc.invalidateQueries({ queryKey: ['spotify-playlists'] });
      setErr(failed ? `${failed} playlist(s) no se pudieron eliminar.` : null);
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar.'),
  });
  const busy = del.isPending;

  function deleteOne(p: SpotifyOwnPlaylist) {
    setConfirm({
      title: 'Quitar playlist',
      danger: true,
      confirmLabel: 'Quitar',
      message: (
        <>
          ¿Quitar <b className="text-neutral-100">{p.name}</b> de tu cuenta de
          Spotify? (dejas de seguirla). Requiere permiso de modificación.
        </>
      ),
      onConfirm: () => {
        setErr(null);
        del.mutate([p.id]);
      },
    });
  }

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // Agrega a Mis Canciones una canción que YA existe en el catálogo (por id).
  const addToLibrary = useMutation({
    mutationFn: (trackId: string) =>
      api('/music/library', { method: 'POST', body: { trackId } }),
    onSuccess: invalidateAfterChange,
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
            <SpotifyIcon className="h-6 w-6 shrink-0" /> Playlists de Spotify
          </h1>
          <p className="text-sm text-neutral-400">
            Conecta tu cuenta de Spotify y revisa tus playlists (con match al
            catálogo).
          </p>
        </div>
        {connected && (
          <div className="flex flex-wrap items-center gap-2">
            {!selectedId &&
              (playlists?.length ?? 0) > 0 &&
              (!selectMode ? (
                <Button variant="ghost" onClick={() => setSelectMode(true)}>
                  ☑️ Seleccionar
                </Button>
              ) : (
                <>
                  <span className="text-sm text-neutral-400">
                    {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
                  </span>
                  <Button
                    variant="danger"
                    disabled={selected.size === 0 || busy}
                    onClick={() =>
                      setConfirm({
                        title: 'Quitar playlists',
                        danger: true,
                        confirmLabel: `Quitar ${selected.size}`,
                        message: (
                          <>
                            ¿Quitar {selected.size} playlist
                            {selected.size === 1 ? '' : 's'} de tu cuenta de
                            Spotify? (dejas de seguirlas).
                          </>
                        ),
                        onConfirm: () => {
                          setErr(null);
                          del.mutate([...selected]);
                        },
                      })
                    }
                  >
                    {busy ? 'Quitando…' : `🗑 Quitar (${selected.size})`}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={exitSelect}>
                    Cancelar
                  </Button>
                </>
              ))}
            <Button
              variant="ghost"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Desconectar Spotify
            </Button>
          </div>
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
            {(playlists ?? []).map((p) => {
              const isSelected = selected.has(p.id);
              const onActivate = () =>
                selectMode ? toggleSel(p.id) : setSelectedId(p.id);
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={onActivate}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onActivate();
                    }
                  }}
                  className="cursor-pointer text-left"
                >
                  <Card
                    className={clsx(
                      'relative flex h-full gap-3 transition',
                      selectMode
                        ? isSelected
                          ? 'border-brand ring-1 ring-brand'
                          : 'hover:border-neutral-600'
                        : 'hover:border-brand/60',
                    )}
                  >
                    {selectMode && (
                      <span
                        className={clsx(
                          'absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border text-xs',
                          isSelected
                            ? 'border-brand bg-brand text-white'
                            : 'border-neutral-600 bg-neutral-900/80 text-transparent',
                        )}
                      >
                        ✓
                      </span>
                    )}
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded bg-neutral-800 object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded bg-neutral-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate pr-14 font-semibold">{p.name}</div>
                    </div>

                    {!selectMode && (
                      <div className="absolute right-2 top-2 flex gap-1">
                        <button
                          type="button"
                          title="Ver en Spotify"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(p.url, '_blank', 'noopener,noreferrer');
                          }}
                          className="flex items-center rounded-md bg-neutral-800/80 px-1.5 py-1 text-neutral-400 transition hover:bg-brand/20"
                        >
                          <SpotifyIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Quitar de tu cuenta (dejar de seguir)"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteOne(p);
                          }}
                          className="rounded-md bg-neutral-800/80 px-1.5 py-0.5 text-sm text-neutral-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
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

          {detailLoading && (
            <LoadingBar
              label="Leyendo la playlist…"
              estMs={Math.max(
                3000,
                (playlists?.find((p) => p.id === selectedId)?.itemCount ?? 40) *
                  25,
              )}
            />
          )}

          {detailIsError &&
            !detailLoading &&
            (() => {
              const msg =
                detailError instanceof ApiError
                  ? detailError.message
                  : 'No se pudo leer la playlist.';
              const isRate = /(rate|429|demasiad|l[íi]mite)/i.test(msg);
              const isAuth = /(reconect|conecta|expir|conexi[óo]n|401)/i.test(
                msg,
              );
              // Restricción de Spotify (playlist generada por Spotify o
              // restringida): no es un error nuestro y reintentar no ayuda.
              const isRestricted =
                /no permite leer|generadas? por spotify|restringid/i.test(msg);
              const amber = isRate || isRestricted;
              return (
                <Card
                  className={
                    amber
                      ? 'space-y-3 border-amber-500/40 bg-amber-500/10 text-amber-200/90'
                      : 'space-y-3 text-red-300'
                  }
                >
                  <p className="text-sm">
                    {amber ? '⚠️ ' : ''}
                    {isRate
                      ? 'Spotify limitó las solicitudes por un momento (playlist grande o muchas seguidas). Espera unos segundos y reintenta.'
                      : msg}
                  </p>
                  {!isRestricted && (
                    <Button
                      onClick={() =>
                        qc.invalidateQueries({
                          queryKey: ['spotify-playlist', selectedId],
                        })
                      }
                    >
                      Reintentar
                    </Button>
                  )}
                  {isAuth && (
                    <Button variant="ghost" onClick={connect}>
                      🔗 Reconectar Spotify
                    </Button>
                  )}
                </Card>
              );
            })()}

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
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title={
                                playing?.sourceId === it.sourceId
                                  ? 'Detener'
                                  : 'Reproducir (Spotify)'
                              }
                              onClick={() =>
                                setPlaying(
                                  playing?.sourceId === it.sourceId
                                    ? null
                                    : {
                                        sourceId: it.sourceId,
                                        title: it.title,
                                        artist: it.artist,
                                        imageUrl: it.imageUrl,
                                      },
                                )
                              }
                              className={
                                'rounded-md px-2 py-1 text-xs transition ' +
                                (playing?.sourceId === it.sourceId
                                  ? 'bg-brand/20 text-brand'
                                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700')
                              }
                            >
                              {playing?.sourceId === it.sourceId ? '⏸' : '▶'}
                            </button>
                            {!it.match?.inLibrary && (
                              <button
                                type="button"
                                title="Agregar a Mis Canciones"
                                disabled={addToLibrary.isPending}
                                onClick={() => {
                                  if (it.match) {
                                    addToLibrary.mutate(it.match.trackId);
                                  } else {
                                    setAddInCatalog(false);
                                    setAddTrack({
                                      videoId: it.sourceId,
                                      title: it.title,
                                      channelTitle: it.artist ?? '',
                                      thumbnailUrl: it.imageUrl,
                                      year: it.year,
                                    });
                                  }
                                }}
                                className="rounded-md border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-xs text-neutral-300 transition hover:border-brand hover:text-brand disabled:opacity-50"
                              >
                                + Mis Canciones
                              </button>
                            )}
                            {!it.match && isSuperAdmin && (
                              <button
                                type="button"
                                title="Agregar al Catálogo (global)"
                                onClick={() => {
                                  setAddInCatalog(true);
                                  setAddTrack({
                                    videoId: it.sourceId,
                                    title: it.title,
                                    channelTitle: it.artist ?? '',
                                    thumbnailUrl: it.imageUrl,
                                    year: it.year,
                                  });
                                }}
                                className="rounded-md border border-sky-700/60 bg-sky-500/10 px-2 py-1 text-xs text-sky-300 transition hover:border-sky-500 hover:text-sky-200"
                              >
                                + Catálogo
                              </button>
                            )}
                            <a
                              href={it.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir en Spotify"
                              className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
                            >
                              ↗
                            </a>
                          </div>
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

      {addTrack && (
        <AddVideoToLibraryModal
          video={addTrack}
          source="SPOTIFY"
          startInCatalog={addInCatalog}
          onClose={() => setAddTrack(null)}
          onAdded={invalidateAfterChange}
        />
      )}

      {/* Reproductor embebido de Spotify (preview 30s; pista completa si tienes
          sesión Premium en el navegador). */}
      {playing && (
        <>
          <div className="h-24" />
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-800 bg-neutral-900/95 p-3 backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <SpotifyPlayerBar
                track={playing}
                onClose={() => setPlaying(null)}
              />
            </div>
          </div>
        </>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
