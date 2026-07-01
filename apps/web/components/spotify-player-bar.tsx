'use client';

import { useEffect, useRef } from 'react';

/**
 * Carga (una vez) la IFrame API de Spotify y resuelve con el objeto IFrameAPI.
 * Permite controlar el reproductor por código (play/loadUri) — el embed simple
 * no autoreproduce.
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

/**
 * Reproductor embebido de Spotify controlable: al montar reproduce la pista, y
 * al cambiar `trackId` carga y reproduce la nueva (preview 30s; completa si hay
 * sesión Premium en el navegador).
 */
export function SpotifyPlayerBar({
  trackId,
  onClose,
}: {
  trackId: string;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<any>(null);

  // Crea el controller una sola vez (createController reemplaza el div por el iframe).
  useEffect(() => {
    let destroyed = false;
    void loadSpotifyApi().then((IFrameAPI) => {
      if (destroyed || !hostRef.current || controllerRef.current) return;
      IFrameAPI.createController(
        hostRef.current,
        { uri: `spotify:track:${trackId}`, width: '100%', height: 80 },
        (controller: any) => {
          controllerRef.current = controller;
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
    // Solo al montar: los cambios de pista los maneja el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar de pista, carga y reproduce la nueva.
  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    try {
      c.loadUri(`spotify:track:${trackId}`);
      c.play();
    } catch {
      /* noop */
    }
  }, [trackId]);

  return (
    <div className="flex items-center gap-2">
      <div ref={hostRef} className="w-full" />
      <button
        type="button"
        title="Cerrar reproductor"
        onClick={onClose}
        className="shrink-0 rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-700"
      >
        ✕
      </button>
    </div>
  );
}
