'use client';

import { useEffect, useRef, useState } from 'react';

/** Datos mínimos para el reproductor propio de Spotify. */
export interface SpotifyPlayable {
  sourceId: string;
  title: string;
  artist: string | null;
  imageUrl: string | null;
}

/**
 * Carga (una vez) la IFrame API de Spotify. Permite controlar el reproductor por
 * código y escuchar el progreso, para dibujar NUESTRA propia UI (sin el fondo de
 * color que Spotify pinta según la carátula).
 */
let apiPromise: Promise<any> | null = null;
function loadSpotifyApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.__spotifyIframeApi) return Promise.resolve(w.__spotifyIframeApi);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    w.onSpotifyIframeApiReady = (IFrameAPI: any) => {
      w.__spotifyIframeApi = IFrameAPI;
      resolve(IFrameAPI);
    };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    document.body.appendChild(s);
  });
  return apiPromise;
}

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
/** El evento trae ms o s según versión; normaliza a segundos. */
const toSec = (v: number) => (v > 10000 ? v / 1000 : v);

/**
 * Reproductor propio de Spotify: UI transparente (solo carátula, textos y
 * controles) que maneja un iframe de Spotify OCULTO (solo audio). Preview 30s;
 * pista completa si hay sesión Premium en el navegador.
 */
export function SpotifyPlayerBar({
  track,
  onClose,
}: {
  track: SpotifyPlayable;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<any>(null);
  const [paused, setPaused] = useState(false);
  const [pos, setPos] = useState(0); // segundos
  const [dur, setDur] = useState(0); // segundos

  // Crea el controller una sola vez (el iframe queda oculto fuera de pantalla).
  useEffect(() => {
    let destroyed = false;
    void loadSpotifyApi().then((IFrameAPI) => {
      if (destroyed || !hostRef.current || controllerRef.current) return;
      IFrameAPI.createController(
        hostRef.current,
        { uri: `spotify:track:${track.sourceId}`, width: 320, height: 80 },
        (controller: any) => {
          controllerRef.current = controller;
          controller.addListener('playback_update', (e: any) => {
            const d = e?.data ?? {};
            if (typeof d.duration === 'number') setDur(toSec(d.duration));
            if (typeof d.position === 'number') setPos(toSec(d.position));
            if (typeof d.isPaused === 'boolean') setPaused(d.isPaused);
          });
          try {
            controller.play();
          } catch {
            /* el navegador puede requerir un segundo gesto */
          }
        },
      );
    });
    return () => {
      destroyed = true;
      try {
        controllerRef.current?.destroy();
      } catch {
        /* noop */
      }
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar de pista: carga y reproduce la nueva.
  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    setPos(0);
    setDur(0);
    try {
      c.loadUri(`spotify:track:${track.sourceId}`);
      c.play();
    } catch {
      /* noop */
    }
  }, [track.sourceId]);

  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

  function seekAt(clientX: number, el: HTMLElement) {
    if (dur <= 0) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const sec = ratio * dur;
    setPos(sec);
    try {
      controllerRef.current?.seek?.(sec);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="flex items-center gap-3">
      {track.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.imageUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded object-cover"
        />
      )}

      <button
        type="button"
        title={paused ? 'Reproducir' : 'Pausar'}
        aria-label={paused ? 'Reproducir' : 'Pausar'}
        onClick={() => {
          try {
            controllerRef.current?.togglePlay?.();
          } catch {
            /* noop */
          }
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark"
      >
        {paused ? '▶' : '⏸'}
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{track.title}</div>
        <div className="truncate text-xs text-neutral-400">
          {track.artist ?? ''}
        </div>
        <div
          onClick={(e) => seekAt(e.clientX, e.currentTarget)}
          className="mt-1 h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-neutral-700"
        >
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <span className="shrink-0 text-xs tabular-nums text-neutral-400">
        {fmt(pos)} / {fmt(dur)}
      </span>

      <button
        type="button"
        title="Cerrar reproductor"
        onClick={onClose}
        className="shrink-0 rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-700"
      >
        ✕
      </button>

      {/* iframe de Spotify oculto (solo audio). No usar display:none: se pausa. */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-[-9999px] top-0 h-20 w-80 opacity-0"
      >
        <div ref={hostRef} />
      </div>
    </div>
  );
}
