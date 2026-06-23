'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  YoutubeConnectionStatus,
  YoutubePlaylistPreview,
  YoutubePlaylistResult,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Select, Spinner } from './ui';

type Privacy = 'private' | 'unlisted' | 'public';

export function YoutubePlaylistModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>(
    'loading',
  );
  const [title, setTitle] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [preview, setPreview] = useState<YoutubePlaylistPreview | null>(null);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<YoutubePlaylistResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api<YoutubeConnectionStatus>('/music/youtube/status')
      .then((s) => {
        const connected = s.connected;
        setStatus(connected ? 'connected' : 'disconnected');
        if (connected) {
          api<YoutubePlaylistPreview>('/music/youtube/preview')
            .then(setPreview)
            .catch(() => undefined);
        }
      })
      .catch(() => setStatus('disconnected'));
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function connect() {
    setErr(null);
    try {
      const { url } = await api<{ url: string }>('/music/youtube/auth-url');
      window.location.href = url; // redirige a Google
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo iniciar la conexión');
    }
  }

  async function disconnect() {
    await api('/music/youtube/connection', { method: 'DELETE' }).catch(
      () => undefined,
    );
    setStatus('disconnected');
    setResult(null);
  }

  async function create() {
    setErr(null);
    setCreating(true);
    setProgress(2);

    // Avance referencial: estimamos ~0.45s por canción + base; la barra sube
    // hasta 95% según el tiempo estimado y salta a 100% al terminar.
    const total = preview?.total ?? 30;
    const estMs = 1200 + total * 450;
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const pct = Math.min(95, Math.round(((Date.now() - start) / estMs) * 100));
      setProgress((p) => (pct > p ? pct : p));
    }, 250);

    try {
      const res = await api<YoutubePlaylistResult>('/music/youtube/playlist', {
        method: 'POST',
        body: { title: title.trim() || undefined, privacy },
      });
      setProgress(100);
      setResult(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo crear la playlist');
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setCreating(false);
    }
  }

  const estCount = preview?.total ?? 0;
  const approxDone = Math.round((progress / 100) * estCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">▶️ Crear playlist en YouTube</h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-neutral-400">
          Toma tus canciones de YouTube, baraja cada estilo al azar y arma el
          patrón <b>5 bachatas → 3 salsas</b>, repitiendo. Solo bloques
          completos (corta al romperse el patrón).
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
                placeholder="Set 5x3 — Baile Latino"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
                <option value="unlisted">No listada (con enlace)</option>
                <option value="private">Privada</option>
              </Select>
            </div>

            {preview && (
              <p className="text-xs text-neutral-400">
                {preview.total > 0 ? (
                  <>
                    Se crearán <b className="text-neutral-200">{preview.total}</b>{' '}
                    canciones ({preview.bachata} bachatas / {preview.salsa} salsas).
                    {preview.leftover > 0 && (
                      <> Quedarán {preview.leftover} fuera por el corte.</>
                    )}
                  </>
                ) : (
                  <span className="text-amber-300">
                    No alcanza para un bloque (se necesitan ≥5 bachatas y ≥3
                    salsas de YouTube).
                  </span>
                )}
              </p>
            )}

            {creating && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-400">
                  Agregando canciones… {approxDone}/{estCount} (~{progress}%)
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={disconnect}
                disabled={creating}
                className="text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-40"
              >
                Desconectar cuenta
              </button>
              <Button
                disabled={creating || preview?.total === 0}
                onClick={create}
              >
                {creating ? 'Creando…' : 'Crear playlist'}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">
              ✓ Playlist creada con <b>{result.total}</b> canciones (
              {result.bachata} bachatas / {result.salsa} salsas).
              {result.leftover > 0 && (
                <>
                  {' '}
                  Quedaron <b>{result.leftover}</b> fuera por el corte del
                  patrón.
                </>
              )}
            </p>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              ▶ Abrir en YouTube
            </a>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      </div>
    </div>
  );
}
