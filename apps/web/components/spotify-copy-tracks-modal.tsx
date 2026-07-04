'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from './ui';
import { SpotifyIcon } from './spotify-icon';

export interface SpotifyCopyTrack {
  sourceId: string;
  title: string;
  artist: string | null;
}

/**
 * Copia las canciones de Spotify de una playlist interna como enlaces, para
 * pegarlas en una playlist de Spotify (escritorio).
 *
 * Por qué copiar y no crear directo: Spotify solo permite crear/modificar
 * playlists vía API a apps en "Extended Quota Mode", que exige entidad de
 * negocio registrada y +250k usuarios activos mensuales (política del 15 de
 * mayo de 2025). Mientras tanto, este flujo funciona para cualquier usuario
 * sin permisos especiales.
 */
export function SpotifyCopyTracksModal({
  playlistName,
  tracks,
  onClose,
}: {
  playlistName: string;
  /** Canciones de Spotify de la playlist (en orden). */
  tracks: SpotifyCopyTrack[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);

  // Un enlace por línea, en el orden de la playlist.
  const links = useMemo(
    () =>
      tracks
        .filter((t) => t.sourceId)
        .map((t) => `https://open.spotify.com/track/${t.sourceId}`)
        .join('\n'),
    [tracks],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy() {
    setCopyErr(false);
    try {
      await navigator.clipboard.writeText(links);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // El navegador puede bloquear el portapapeles: mostramos el textarea
      // para copiar a mano.
      setCopyErr(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <SpotifyIcon className="h-5 w-5" />
            Copiar canciones para Spotify
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-neutral-400">
          Copia las <b className="text-neutral-200">{tracks.length}</b> canciones
          de Spotify de <b className="text-neutral-200">{playlistName}</b> y
          pégalas en una playlist nueva en Spotify (escritorio).
        </p>

        {tracks.length === 0 ? (
          <p className="rounded-lg bg-neutral-800/50 px-3 py-2 text-sm text-neutral-400">
            Esta playlist no tiene canciones de Spotify.
          </p>
        ) : (
          <div className="space-y-4">
            <Button onClick={copy} disabled={!links}>
              {copied ? '✓ Copiado al portapapeles' : `Copiar ${tracks.length} canciones`}
            </Button>

            {copyErr && (
              <div className="space-y-1">
                <p className="text-xs text-amber-300/90">
                  No se pudo copiar automáticamente. Selecciona el texto y cópialo
                  a mano (Ctrl+C):
                </p>
                <textarea
                  readOnly
                  value={links}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-28 w-full rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-300"
                />
              </div>
            )}

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
              ⚠️ Pegar varias canciones de golpe <b>solo funciona en la app de
              escritorio</b> de Spotify. En el reproductor web (open.spotify.com)
              no se puede.
            </div>

            <ol className="space-y-1.5 rounded-lg border border-neutral-800 bg-neutral-800/30 p-3 text-xs text-neutral-300">
              <li>
                <b className="text-neutral-100">1.</b> Abre la{' '}
                <a
                  href="spotify:collection:playlists"
                  className="inline-flex items-center gap-1 font-medium text-[#1DB954] hover:underline"
                >
                  <SpotifyIcon className="h-3.5 w-3.5" />
                  app de escritorio de Spotify ↗
                </a>{' '}
                y crea una playlist nueva.{' '}
                <a
                  href="https://open.spotify.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-400 underline hover:text-neutral-200"
                >
                  ¿No la tienes? Descárgala
                </a>
                .
              </li>
              <li>
                <b className="text-neutral-100">2.</b> Haz clic en el{' '}
                <b>área de la lista de canciones</b> (no en el buscador) y pega
                con <b>Ctrl+V</b> (⌘V en Mac).
              </li>
              <li>
                <b className="text-neutral-100">3.</b> Spotify agrega las{' '}
                {tracks.length} canciones de golpe, en orden.
              </li>
            </ol>

            <p className="text-[11px] leading-relaxed text-neutral-500">
              Crear la playlist automáticamente en tu cuenta requiere el acceso
              ampliado de Spotify (reservado a apps con entidad de negocio y gran
              volumen de usuarios). Mientras tanto, este método funciona igual.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
