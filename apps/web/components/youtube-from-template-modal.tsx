'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  YoutubeConnectionStatus,
  YoutubePlaylistFromTemplateResult,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Select, Spinner } from './ui';
import { YoutubeIcon } from './youtube-icon';

type Privacy = 'private' | 'unlisted' | 'public';

/**
 * Crea una playlist en YouTube con las canciones (de YouTube) de una playlist
 * interna. Es un snapshot: NO se vincula ni sincroniza con la plantilla.
 */
export function YoutubeFromTemplateModal({
  playlistId,
  playlistName,
  itemCount,
  onClose,
}: {
  playlistId: string;
  playlistName: string;
  itemCount: number;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>(
    'loading',
  );
  const [title, setTitle] = useState(playlistName);
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<YoutubePlaylistFromTemplateResult | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // El error sugiere que hay que (re)conectar la cuenta (token vencido/revocado).
  const needsReconnect =
    !!err && /conect|youtube|token|expir|sesi[oó]n|autoriz|credencial/i.test(err);

  useEffect(() => {
    api<YoutubeConnectionStatus>('/music/youtube/status')
      .then((s) => setStatus(s.connected ? 'connected' : 'disconnected'))
      .catch(() => setStatus('disconnected'));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !creating && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, creating]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  async function connect() {
    setErr(null);
    try {
      const { url } = await api<{ url: string }>('/music/youtube/auth-url');
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo iniciar la conexión');
    }
  }

  async function create() {
    setErr(null);
    setCreating(true);
    setProgress(2);

    // Avance referencial: ~0.45s por canción + base.
    const estMs = 1200 + itemCount * 450;
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const pct = Math.min(95, Math.round(((Date.now() - start) / estMs) * 100));
      setProgress((p) => (pct > p ? pct : p));
    }, 250);

    try {
      const res = await api<YoutubePlaylistFromTemplateResult>(
        `/music/youtube/from-template/${playlistId}`,
        { method: 'POST', body: { title: title.trim() || undefined, privacy } },
      );
      setProgress(100);
      setResult(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear la playlist');
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
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
            <YoutubeIcon className="h-5 w-5 text-[#FF0000]" />
            Crear playlist en YouTube
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-neutral-400">
          Crea una playlist en tu cuenta de YouTube con las canciones de{' '}
          <b className="text-neutral-200">{playlistName}</b>. Es una copia
          (snapshot): <b>no se vincula</b> con la plantilla, así que si después
          cambias la plantilla, esta no se altera.
        </p>

        {status === 'loading' && <Spinner label="Comprobando conexión…" />}

        {status === 'disconnected' && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">
              Para crear la playlist en tu cuenta, primero conecta tu YouTube.
            </p>
            <Button onClick={connect}>🔗 Conectar cuenta de YouTube</Button>
          </div>
        )}

        {status === 'connected' && !result && (
          <div className="space-y-3">
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
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Privacidad
              </label>
              <Select
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value as Privacy)}
              >
                <option value="public">Pública</option>
                <option value="unlisted">Oculta (con enlace)</option>
                <option value="private">Privada</option>
              </Select>
            </div>

            {creating && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {err && (
              <div className="space-y-2">
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {err}
                </p>
                {/* La conexión guardada puede estar vencida/revocada aunque el
                    estado diga "conectado": ofrece reconectar sin salir del modal. */}
                {needsReconnect && (
                  <Button variant="ghost" disabled={creating} onClick={connect}>
                    🔗 Reconectar cuenta de YouTube
                  </Button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" disabled={creating} onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={creating} onClick={create}>
                {creating ? 'Creando…' : 'Crear en YouTube'}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              ✓ Playlist creada con {result.added} canciones
              {result.skipped > 0 &&
                ` (${result.skipped} omitidas por no ser de YouTube)`}
              .
            </p>
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              <Button>
                <span className="flex items-center gap-2">
                  <YoutubeIcon className="h-4 w-4 text-white" />
                  Abrir en YouTube ↗
                </span>
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
