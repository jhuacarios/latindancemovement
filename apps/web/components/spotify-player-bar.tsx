'use client';

import { useEffect, useRef } from 'react';

/** Datos del track a reproducir (title/artist/imageUrl son informativos). */
export interface SpotifyPlayable {
  sourceId: string;
  title: string;
  artist: string | null;
  imageUrl: string | null;
}

/**
 * Carga (una vez) la IFrame API de Spotify para controlar el reproductor por
 * código (play/loadUri) — el embed simple no autoreproduce.
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
 * Reproductor de Spotify: usa el embed OFICIAL (visible) controlado por la
 * IFrame API para que el ▶ dedicado lo reproduzca al instante. El embed debe
 * estar visible: Spotify pausa el audio si su iframe no está en pantalla, por
 * eso no se puede ocultar ni quitarle su fondo (es su propio reproductor).
 * Preview 30s; pista completa si hay sesión Premium en el navegador.
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

  // Crea el controller una sola vez (createController reemplaza el div por el iframe).
  useEffect(() => {
    let destroyed = false;
    void loadSpotifyApi().then((IFrameAPI) => {
      if (destroyed || !hostRef.current || controllerRef.current) return;
      IFrameAPI.createController(
        hostRef.current,
        { uri: `spotify:track:${track.sourceId}`, width: '100%', height: 80 },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar de pista, carga y reproduce la nueva.
  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    try {
      c.loadUri(`spotify:track:${track.sourceId}`);
      c.play();
    } catch {
      /* noop */
    }
  }, [track.sourceId]);

  return (
    <div className="flex items-center gap-2">
      <div ref={hostRef} className="w-full overflow-hidden rounded-xl" />
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
