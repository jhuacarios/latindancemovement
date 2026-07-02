'use client';

import { useEffect, useState } from 'react';
import type { SpotifyConnectionStatus } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input } from './ui';
import { SpotifyIcon } from './spotify-icon';

interface FromInternalResult {
  playlistId: string;
  url: string;
  added: number;
  skipped: number;
}

/**
 * Crea una playlist en la cuenta de Spotify del usuario con las canciones (de
 * Spotify) de una playlist interna. Snapshot: no se sincroniza.
 */
export function SpotifyFromInternalModal({
  playlistId,
  playlistName,
  itemCount,
  onClose,
}: {
  playlistId: string;
  playlistName: string;
  /** Cuántas canciones de Spotify tiene la playlist. */
  itemCount: number;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>(
    'loading',
  );
  const [title, setTitle] = useState(playlistName);
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<FromInternalResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<{
    displayName: string | null;
    email: string | null;
    product: string | null;
  } | null>(null);

  const needsReconnect =
    !!err && /conect|token|expir|scope|403|permiso|autoriz/i.test(err);

  useEffect(() => {
    api<SpotifyConnectionStatus>('/music/spotify/status')
      .then((s) => {
        setStatus(s.connected ? 'connected' : 'disconnected');
        if (s.connected) {
          api<{
            displayName: string | null;
            email: string | null;
            product: string | null;
          }>('/music/spotify/me')
            .then(setMe)
            .catch(() => {});
        }
      })
      .catch(() => setStatus('disconnected'));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !creating && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, creating]);

  async function connect() {
    setErr(null);
    try {
      const { url } = await api<{ url: string }>('/music/spotify/auth-url');
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo iniciar la conexión');
    }
  }

  async function create() {
    setErr(null);
    setCreating(true);
    try {
      const res = await api<FromInternalResult>(
        `/music/spotify/from-internal/${playlistId}`,
        { method: 'POST', body: { title: title.trim() || undefined, public: isPublic } },
      );
      setResult(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear la playlist');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => !creating && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <SpotifyIcon className="h-5 w-5" />
            Crear playlist en Spotify
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-neutral-400">
          Crea una playlist en tu cuenta de Spotify con las canciones de Spotify de{' '}
          <b className="text-neutral-200">{playlistName}</b>. Es una copia
          (snapshot): <b>no se sincroniza</b> con la interna.
        </p>

        {status === 'loading' && (
          <p className="text-sm text-neutral-400">Comprobando conexión…</p>
        )}

        {status === 'disconnected' && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">
              Conecta tu cuenta de Spotify para crear la playlist.
            </p>
            <Button onClick={connect}>🔗 Conectar cuenta de Spotify</Button>
          </div>
        )}

        {status === 'connected' && !result && (
          <div className="space-y-3">
            {me && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-800/40 px-3 py-2 text-xs text-neutral-300">
                Conectado como <b>{me.displayName ?? 'tu cuenta'}</b>
                {me.email && (
                  <>
                    {' '}
                    (<span className="text-neutral-100">{me.email}</span>)
                  </>
                )}
                {me.product && me.product !== 'premium' && (
                  <span className="ml-1 text-amber-300/90">· cuenta {me.product}</span>
                )}
                {me.email && (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Si da 403 al crear: agrega <b>este email</b> en el dashboard
                    de Spotify → tu app → User Management.
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Nombre de la playlist
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={playlistName}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="accent-[var(--color-brand)]"
              />
              Pública (si no, queda privada)
            </label>

            {err && (
              <div className="space-y-2">
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {err}
                </p>
                {needsReconnect && (
                  <Button variant="ghost" disabled={creating} onClick={connect}>
                    🔗 Reconectar cuenta de Spotify
                  </Button>
                )}
                <p className="text-[11px] text-neutral-500">
                  Si conectaste antes, quizá falte el permiso para crear
                  playlists: reconecta para otorgarlo.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" disabled={creating} onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={creating || itemCount === 0} onClick={create}>
                {creating ? 'Creando…' : `Crear en Spotify (${itemCount})`}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              ✓ Playlist creada con {result.added} canciones
              {result.skipped > 0 &&
                ` (${result.skipped} omitidas por no ser de Spotify)`}
              .
            </p>
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              <Button>
                <span className="flex items-center gap-2">
                  <SpotifyIcon className="h-4 w-4" />
                  Abrir en Spotify ↗
                </span>
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
