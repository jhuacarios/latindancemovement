'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  YoutubeConnectionStatus,
  YoutubeOwnPlaylist,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Spinner } from '@/components/ui';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { YoutubeIcon } from '@/components/youtube-icon';
import { clsx } from '@/components/clsx';

const PRIVACY_LABEL: Record<string, string> = {
  public: 'Pública',
  unlisted: 'Oculta',
  private: 'Privada',
};

export default function YoutubePlaylistsPage() {
  const qc = useQueryClient();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const status = useQuery({
    queryKey: ['youtube-status'],
    queryFn: () => api<YoutubeConnectionStatus>('/music/youtube/status'),
  });

  const connected = status.data?.connected === true;

  const playlists = useQuery({
    queryKey: ['youtube-playlists'],
    queryFn: () => api<YoutubeOwnPlaylist[]>('/music/youtube/playlists'),
    enabled: connected,
  });

  async function connect() {
    try {
      const { url } = await api<{ url: string }>('/music/youtube/auth-url');
      window.location.href = url;
    } catch {
      // el error de auth-url es raro; se ignora silenciosamente
    }
  }

  const del = useMutation({
    mutationFn: async (ids: string[]) => {
      let failed = 0;
      for (const id of ids) {
        try {
          await api(`/music/youtube/playlists/${id}`, { method: 'DELETE' });
        } catch {
          failed++;
        }
      }
      return failed;
    },
    onSuccess: async (failed) => {
      setSelected(new Set());
      setSelectMode(false);
      await qc.invalidateQueries({ queryKey: ['youtube-playlists'] });
      setErr(failed ? `${failed} playlist(s) no se pudieron eliminar.` : null);
    },
    onError: (e) =>
      setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar.'),
  });

  function deleteOne(p: YoutubeOwnPlaylist) {
    setConfirm({
      title: 'Eliminar playlist',
      danger: true,
      confirmLabel: 'Eliminar',
      message: (
        <>
          ¿Eliminar la playlist <b className="text-neutral-100">{p.title}</b> de
          tu cuenta de YouTube? Esta acción no se puede deshacer.
        </>
      ),
      onConfirm: () => {
        setErr(null);
        del.mutate([p.id]);
      },
    });
  }

  function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setConfirm({
      title: 'Eliminar playlists',
      danger: true,
      confirmLabel: `Eliminar ${ids.length}`,
      message: (
        <>
          ¿Eliminar{' '}
          <b className="text-neutral-100">
            {ids.length} playlist{ids.length === 1 ? '' : 's'}
          </b>{' '}
          de tu cuenta de YouTube? Esta acción no se puede deshacer.
        </>
      ),
      onConfirm: () => {
        setErr(null);
        del.mutate(ids);
      },
    });
  }

  function toggle(id: string) {
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

  const items = playlists.data ?? [];
  const busy = del.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Playlists YouTube</h1>
          <p className="text-sm text-neutral-400">
            Las playlists de tu cuenta de YouTube, traídas a la vista.
          </p>
        </div>

        {connected && items.length > 0 && (
          <div className="flex items-center gap-2">
            {!selectMode ? (
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
                  onClick={deleteSelected}
                >
                  {busy ? 'Eliminando…' : `🗑 Eliminar (${selected.size})`}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={exitSelect}>
                  Cancelar
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {err && (
        <Card className="text-sm text-red-300">{err}</Card>
      )}

      {status.isLoading && <Spinner label="Comprobando conexión…" />}

      {status.data && !connected && (
        <Card className="space-y-3">
          <p className="text-sm text-neutral-300">
            Para ver tus playlists, conecta tu cuenta de YouTube.
          </p>
          <Button onClick={connect}>🔗 Conectar cuenta de YouTube</Button>
        </Card>
      )}

      {connected && playlists.isLoading && (
        <Spinner label="Trayendo playlists…" />
      )}

      {connected &&
        playlists.isError &&
        (() => {
          const msg =
            playlists.error instanceof ApiError
              ? playlists.error.message
              : 'No se pudieron traer tus playlists.';
          // La cuota NO se resuelve reconectando; solo los errores de token sí.
          const isQuota = /cuota/i.test(msg);
          const isAuth = /(reconect|conecta|expir|conexi[óo]n)/i.test(msg);
          return (
            <Card
              className={
                isQuota
                  ? 'space-y-3 border-amber-500/40 bg-amber-500/10 text-amber-200/90'
                  : 'space-y-3 text-red-300'
              }
            >
              <p className="text-sm">
                {isQuota ? '⚠️ ' : ''}
                {msg}
              </p>
              {isAuth && !isQuota && (
                <Button onClick={connect}>🔗 Conectar cuenta de YouTube</Button>
              )}
            </Card>
          );
        })()}

      {connected && playlists.data && items.length === 0 && (
        <p className="text-sm text-neutral-500">
          Tu cuenta de YouTube no tiene playlists todavía.
        </p>
      )}

      {connected && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const isSelected = selected.has(p.id);
            const inner = (
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
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnailUrl}
                    alt=""
                    className="h-16 w-24 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded bg-neutral-800 text-2xl">
                    📺
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate pr-16 font-semibold">{p.title}</div>
                  <div className="mt-1 text-sm text-neutral-400">
                    {p.itemCount} {p.itemCount === 1 ? 'video' : 'videos'}
                  </div>
                  <span className="mt-1 inline-block rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                    {PRIVACY_LABEL[p.privacyStatus] ?? p.privacyStatus}
                  </span>
                </div>

                {!selectMode && (
                  <div className="absolute right-2 top-2 flex gap-1">
                    <button
                      type="button"
                      title="Ver en YouTube"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(p.url, '_blank', 'noopener,noreferrer');
                      }}
                      className="flex items-center rounded-md bg-neutral-800/80 px-1.5 py-1 text-neutral-400 transition hover:bg-red-600/20 hover:text-[#FF0000]"
                    >
                      <YoutubeIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Eliminar playlist"
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
            );

            // En selección: alterna selección. Si no: navega al detalle interno.
            return selectMode ? (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="text-left"
              >
                {inner}
              </button>
            ) : (
              <Link key={p.id} href={`/music/youtube-playlists/${p.id}`}>
                {inner}
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
