'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Track } from '@baile-latino/types';
import { api } from '@/lib/api';
import { useIsMobile } from '@/lib/use-is-mobile';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Códigos de error del IFrame de YouTube que indican embed bloqueado/no disponible. */
const EMBED_BLOCKED_CODES = [100, 101, 150];
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface PlayerContextValue {
  playAudio: (track: Track) => void;
  playVideo: (track: Track) => void;
  canPlay: (track: Track) => boolean;
  /** ¿El video de esta canción se detectó como no reproducible fuera de YouTube? */
  isBlocked: (track: Track) => boolean;
  /** Clave (`source:sourceId`) de la canción que está sonando, o null. */
  playingKey: string | null;
  /** Clave de la canción cuyo AUDIO está sonando (para el botón play/pausa). */
  audioKey: string | null;
  /** Detiene el audio actual (cierra la barra de audio). */
  stopAudio: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function ytId(track: Track): string | null {
  return track.source === 'YOUTUBE' ? track.sourceId : null;
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Carga el script de la IFrame API de YouTube una sola vez.
let ytApiPromise: Promise<void> | null = null;
function loadYTApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
  });
  return ytApiPromise;
}

/** Lee el volumen guardado (0-100). Default 30% la primera vez (sin valor guardado). */
function readStoredVolume(): number {
  const DEFAULT = 30;
  if (typeof window === 'undefined') return DEFAULT;
  const raw = localStorage.getItem('bl_volume');
  if (raw === null) return DEFAULT; // primera vez: no muteado
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [audio, setAudio] = useState<Track | null>(null);
  const [video, setVideo] = useState<Track | null>(null);
  // Volumen global persistente (0-100): se mantiene entre reproducciones y sesiones.
  const [volume, setVolumeState] = useState<number>(readStoredVolume);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    setVolumeState(clamped);
    try {
      localStorage.setItem('bl_volume', String(clamped));
    } catch {
      /* noop */
    }
  }, []);
  // VideoIds detectados como bloqueados en esta sesión (refleja la ✕ al instante,
  // incluso en canciones externas que no están en la base).
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const playAudio = useCallback((t: Track) => {
    setVideo(null);
    setAudio(t);
  }, []);
  const stopAudio = useCallback(() => setAudio(null), []);
  const playVideo = useCallback((t: Track) => {
    setAudio(null);
    setVideo(t);
  }, []);
  const canPlay = useCallback((t: Track) => ytId(t) !== null, []);
  const isBlocked = useCallback(
    (t: Track) => {
      const vid = ytId(t);
      return (
        t.details?.embeddable === false || (vid != null && blockedIds.has(vid))
      );
    },
    [blockedIds],
  );

  // El reproductor detectó que YouTube bloquea el embed: lo recuerda en sesión
  // (para la ✕ inmediata) y, si la canción está en la base, lo persiste y
  // refresca las listas.
  const reportBlocked = useCallback(
    (track: Track) => {
      const vid = ytId(track);
      if (vid) setBlockedIds((prev) => new Set(prev).add(vid));
      if (track.id) {
        api(`/music/tracks/${track.id}/not-embeddable`, { method: 'POST' }).catch(
          () => undefined,
        );
        void qc.invalidateQueries({ queryKey: ['catalog'] });
        void qc.invalidateQueries({ queryKey: ['library'] });
        void qc.invalidateQueries({ queryKey: ['youtube-playlist'] });
      }
    },
    [qc],
  );

  const cur = audio ?? video;
  const playingKey = cur ? `${cur.source}:${cur.sourceId}` : null;
  const audioKey = audio ? `${audio.source}:${audio.sourceId}` : null;

  // Memoizado: si no, cada render de un ancestro (p. ej. el layout al abrir un
  // módulo del menú) recreaba este objeto y re-renderizaba a todos los que usan
  // usePlayer, como los botones ▶ de cada fila de la tabla.
  const ctxValue = useMemo(
    () => ({
      playAudio,
      playVideo,
      canPlay,
      isBlocked,
      playingKey,
      audioKey,
      stopAudio,
    }),
    [
      playAudio,
      playVideo,
      canPlay,
      isBlocked,
      playingKey,
      audioKey,
      stopAudio,
    ],
  );

  return (
    <PlayerContext.Provider value={ctxValue}>
      {children}
      {/* Siempre montado (y sin `key` por canción): su iframe debe existir antes
          de que el usuario toque play, o el navegador móvil no lo deja sonar. */}
      <AudioBar
        track={audio}
        volume={volume}
        setVolume={setVolume}
        onClose={() => setAudio(null)}
        onBlocked={reportBlocked}
      />
      {video && (
        <VideoModal
          key={`${video.source}:${video.sourceId}`}
          track={video}
          volume={volume}
          setVolume={setVolume}
          onClose={() => setVideo(null)}
          onBlocked={reportBlocked}
        />
      )}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer debe usarse dentro de <PlayerProvider>');
  return ctx;
}

// --- Mini reproductor de audio con controles y progreso --------------------
/**
 * Barra de audio del pie.
 *
 * El <iframe> de YouTube se crea UNA sola vez, al cargar la página, y después se
 * reutiliza con `loadVideoById`. Es a propósito: los navegadores móviles solo le
 * dan permiso de reproducir a los frames que YA existían cuando el usuario tocó
 * la pantalla. Si el iframe se creara recién al elegir la canción, nacería sin
 * ese permiso y quedaría en pausa (en escritorio no se nota, y la emulación de
 * Chrome tampoco aplica esa política).
 */
function AudioBar({
  track,
  volume,
  setVolume,
  onClose,
  onBlocked,
}: {
  /** `null` mientras no hay nada sonando: la barra se esconde, el iframe queda. */
  track: Track | null;
  volume: number;
  setVolume: (v: number) => void;
  onClose: () => void;
  onBlocked: (track: Track) => void;
}) {
  const id = track ? ytId(track) : null;
  const isMobile = useIsMobile();
  const holderRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  // Refs para leer lo último dentro de los callbacks del player sin recrearlo.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const trackRef = useRef(track);
  trackRef.current = track;
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;

  const [ready, setReady] = useState(false);
  // Arranca en false: antes decía "reproduciendo" antes de que sonara nada, y el
  // ícono de la fila quedaba en ⏸ mientras la barra seguía en ▶.
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const seekingRef = useRef(seeking);
  seekingRef.current = seeking;
  const [blocked, setBlocked] = useState(false);
  // Vigía: si un video no arranca en unos segundos (típico de subidas que
  // prohíben el embed y no disparan onError), se marca como no reproducible.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  // Reserva espacio al final del contenido para que la barra no tape las últimas
  // filas. Se publica el alto REAL (no uno fijo) porque cambia según el ancho:
  // en móvil la barra usa dos filas.
  useEffect(() => {
    const root = document.documentElement;
    const el = barRef.current;
    if (!el || !track) {
      root.style.setProperty('--player-bar-h', '0px');
      return;
    }
    const apply = () =>
      root.style.setProperty('--player-bar-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--player-bar-h', '0px');
    };
  }, [track]);

  // Cuándo crear el iframe de YouTube:
  // - Móvil: al montar (aunque no haya nada sonando), porque el navegador solo
  //   deja reproducir a los frames que ya existían al tocar la pantalla.
  // - Escritorio: recién cuando hay algo que reproducir. Ahí no hay restricción
  //   de autoplay, y tener un embed de YouTube corriendo en cada página hacía
  //   que toda la UI (tablas grandes incluidas) respondiera con lag.
  const shouldCreatePlayer = isMobile || id != null;

  useEffect(() => {
    if (!shouldCreatePlayer) return;
    let destroyed = false;
    void loadYTApi().then(() => {
      if (destroyed || !holderRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(holderRef.current, {
        playerVars: { controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(volumeRef.current); // mantiene el último volumen
            setReady(true);
          },
          onStateChange: (e: any) => {
            const YT = window.YT.PlayerState;
            // Empezó a cargar o a sonar: descarta el vigía (no está bloqueado).
            if (e.data === YT.BUFFERING || e.data === YT.PLAYING) clearWatchdog();
            setPlaying(e.data === YT.PLAYING);
            const d = e.target.getDuration?.() || 0;
            if (d) setDur(d);
          },
          onError: (e: any) => {
            if (EMBED_BLOCKED_CODES.includes(e.data)) {
              setBlocked(true);
              if (trackRef.current) onBlockedRef.current(trackRef.current);
            }
          },
        },
      });
    });
    return () => {
      destroyed = true;
      clearWatchdog();
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      playerRef.current = null;
      setReady(false);
    };
  }, [shouldCreatePlayer]);

  // Al elegir canción se reutiliza el mismo iframe.
  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    clearWatchdog();
    if (!id) {
      // Se quitó la canción. En móvil el iframe queda montado (no se desmonta ni
      // destruye), así que hay que detenerlo a mano; si no, la música sigue
      // sonando aunque la barra desaparezca.
      try {
        p.stopVideo?.();
      } catch {
        /* noop */
      }
      return;
    }
    setBlocked(false);
    setCur(0);
    setDur(0);
    p.setVolume(volumeRef.current);
    p.loadVideoById(id);
    // Si a los 6 s no arrancó (ni buffering ni playing) y sigue sin duración, es
    // un video que no se puede reproducir embebido: lo marcamos como bloqueado.
    watchdogRef.current = setTimeout(() => {
      const pl = playerRef.current;
      const state = pl?.getPlayerState?.();
      const d = pl?.getDuration?.() || 0;
      const PS = window.YT?.PlayerState;
      const running =
        PS && (state === PS.PLAYING || state === PS.BUFFERING || state === PS.PAUSED);
      if (!running && d === 0) {
        setBlocked(true);
        if (trackRef.current) onBlockedRef.current(trackRef.current);
      }
    }, 6000);
  }, [id, ready]);

  // Progreso mientras suena.
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (p?.getCurrentTime) {
        if (!seekingRef.current) setCur(p.getCurrentTime() || 0);
        const d = p.getDuration?.() || 0;
        if (d) setDur(d);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [id]);

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  };

  return (
    <>
      {/* El player vive fuera de la barra y SIEMPRE montado: suena el audio sin
          mostrar el video, y así el iframe ya existe cuando llega el toque. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          width: 1,
          height: 1,
          left: -9999,
          top: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        <div ref={holderRef} />
      </div>

      {track && (
        <div
          ref={barRef}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-900/95 px-2 py-2 backdrop-blur lg:px-4 lg:py-3"
        >
      {/* En móvil la fila envuelve y la barra de progreso baja a una 2ª línea. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 lg:flex-nowrap lg:gap-4">
        <span className="text-lg text-brand max-lg:hidden">♪</span>
        <div className="min-w-0 flex-1 lg:w-48 lg:flex-none lg:shrink-0">
          <div className="truncate text-sm font-medium">{track.title}</div>
          <div className="truncate text-xs text-neutral-400">{track.artist}</div>
        </div>

        {blocked ? (
          <div className="flex flex-1 items-center gap-3 text-sm">
            <span className="text-red-400">
              🚫 No se puede reproducir fuera de YouTube
            </span>
            <a
              href={`https://www.youtube.com/watch?v=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              Ver en YouTube ↗
            </a>
          </div>
        ) : (
          <>
            <button
              onClick={toggle}
              disabled={!ready}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-base text-white hover:bg-brand-dark disabled:opacity-50"
              title={playing ? 'Pausar' : 'Reproducir'}
            >
              {playing ? '⏸' : '▶'}
            </button>

            {/* `lg:contents` disuelve este contenedor en escritorio: la fila
                queda exactamente igual que antes. En móvil es la 2ª línea. */}
            <div className="flex w-full items-center gap-2 max-lg:order-last lg:contents">
              <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
                {fmt(cur)}
              </span>
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={1}
                value={Math.min(cur, dur || 0)}
                disabled={!ready || !dur}
                onMouseDown={() => setSeeking(true)}
                onTouchStart={() => setSeeking(true)}
                onChange={(e) => setCur(Number(e.target.value))}
                onMouseUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  playerRef.current?.seekTo?.(v, true);
                  setSeeking(false);
                }}
                onTouchEnd={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  playerRef.current?.seekTo?.(v, true);
                  setSeeking(false);
                }}
                className="h-1 flex-1 cursor-pointer accent-[var(--color-brand)]"
              />
              <span className="w-10 text-xs tabular-nums text-neutral-400">
                {fmt(dur)}
              </span>
            </div>

            {/* El volumen se maneja con los botones del teléfono. */}
            <div
              className="flex shrink-0 items-center gap-1 max-lg:hidden"
              title={`Volumen: ${volume}%`}
            >
              <span className="text-sm text-neutral-400">
                {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  playerRef.current?.setVolume?.(v);
                }}
                className="h-1 w-20 cursor-pointer accent-[var(--color-brand)]"
              />
            </div>
          </>
        )}

        <button
          onClick={onClose}
          title="Detener"
          className="shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
        >
          ⏹<span className="max-lg:hidden"> Detener</span>
        </button>
        </div>
        </div>
      )}
    </>
  );
}

// --- Reproductor de audio embebible (mismos controles que la barra de pie) ---
/**
 * Mini reproductor de audio para usar EN LÍNEA (p. ej. dentro de un modal),
 * no fijo abajo. Maneja su propio volumen (persistido en localStorage). El video
 * va oculto: solo suena el audio.
 */
export function InlineAudioPlayer({
  track,
  onClose,
}: {
  track: Track;
  onClose?: () => void;
}) {
  const id = ytId(track);
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [volume, setVol] = useState<number>(readStoredVolume);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [blocked, setBlocked] = useState(false);

  function setVolume(v: number) {
    const c = Math.max(0, Math.min(100, Math.round(v)));
    setVol(c);
    try {
      localStorage.setItem('bl_volume', String(c));
    } catch {
      /* noop */
    }
    playerRef.current?.setVolume?.(c);
  }

  useEffect(() => {
    if (!id) return;
    let destroyed = false;
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (p?.getCurrentTime) {
        if (!seeking) setCur(p.getCurrentTime() || 0);
        const d = p.getDuration?.() || 0;
        if (d) setDur(d);
      }
    }, 400);

    loadYTApi().then(() => {
      if (destroyed || !holderRef.current) return;
      playerRef.current = new window.YT.Player(holderRef.current, {
        videoId: id,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: (e: any) => {
            setReady(true);
            setDur(e.target.getDuration() || 0);
            e.target.setVolume(volumeRef.current);
            e.target.playVideo();
          },
          onStateChange: (e: any) => {
            setPlaying(e.data === window.YT.PlayerState.PLAYING);
          },
          onError: (e: any) => {
            if (EMBED_BLOCKED_CODES.includes(e.data)) setBlocked(true);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      clearInterval(interval);
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  };

  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
      <span className="text-lg text-brand">♪</span>
      <div className="w-40 min-w-0 shrink-0">
        <div className="truncate text-sm font-medium">{track.title}</div>
        <div className="truncate text-xs text-neutral-400">{track.artist}</div>
      </div>

      {blocked ? (
        <div className="flex flex-1 items-center gap-2 text-sm">
          <span className="text-red-400">🚫 No reproducible fuera de YouTube</span>
          <a
            href={`https://www.youtube.com/watch?v=${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline"
          >
            Ver ↗
          </a>
        </div>
      ) : (
        <>
          <button
            onClick={toggle}
            disabled={!ready}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-base text-white hover:bg-brand-dark disabled:opacity-50"
            title={playing ? 'Pausar' : 'Reproducir'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <span className="w-9 text-right text-xs tabular-nums text-neutral-400">
            {fmt(cur)}
          </span>
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={1}
            value={Math.min(cur, dur || 0)}
            disabled={!ready || !dur}
            onMouseDown={() => setSeeking(true)}
            onTouchStart={() => setSeeking(true)}
            onChange={(e) => setCur(Number(e.target.value))}
            onMouseUp={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              playerRef.current?.seekTo?.(v, true);
              setSeeking(false);
            }}
            onTouchEnd={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              playerRef.current?.seekTo?.(v, true);
              setSeeking(false);
            }}
            className="h-1 flex-1 cursor-pointer accent-[var(--color-brand)]"
          />
          <span className="w-9 text-xs tabular-nums text-neutral-400">
            {fmt(dur)}
          </span>
          <div
            className="flex shrink-0 items-center gap-1"
            title={`Volumen: ${volume}%`}
          >
            <span className="text-sm text-neutral-400">
              {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1 w-16 cursor-pointer accent-[var(--color-brand)]"
            />
          </div>
        </>
      )}

      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg bg-neutral-800 px-2 py-1 text-sm hover:bg-neutral-700"
          title="Cerrar"
        >
          ✕
        </button>
      )}

      {/* player oculto: suena el audio sin mostrar el video */}
      <div
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          left: -9999,
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        <div ref={holderRef} />
      </div>
    </div>
  );
}

// --- Modal de video --------------------------------------------------------
function VideoModal({
  track,
  volume,
  setVolume,
  onClose,
  onBlocked,
}: {
  track: Track;
  volume: number;
  setVolume: (v: number) => void;
  onClose: () => void;
  onBlocked: (track: Track) => void;
}) {
  const id = ytId(track);
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Usa YT.Player (en vez de un iframe simple) para poder detectar el bloqueo.
  useEffect(() => {
    if (!id) return;
    let destroyed = false;
    // Captura cambios de volumen hechos en los controles nativos de YouTube,
    // para que se mantengan en la próxima reproducción.
    const sync = setInterval(() => {
      const p = playerRef.current;
      if (p?.getVolume) {
        const v = Math.round(p.getVolume());
        if (Number.isFinite(v) && v !== volumeRef.current) setVolume(v);
      }
    }, 800);
    loadYTApi().then(() => {
      if (destroyed || !holderRef.current) return;
      playerRef.current = new window.YT.Player(holderRef.current, {
        videoId: id,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(volumeRef.current); // mantiene el último volumen
            e.target.playVideo();
          },
          onError: (e: any) => {
            if (EMBED_BLOCKED_CODES.includes(e.data)) {
              setBlocked(true);
              onBlocked(track);
            }
          },
        },
      });
    });
    return () => {
      destroyed = true;
      clearInterval(sync);
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{track.title}</div>
            <div className="truncate text-xs text-neutral-400">{track.artist}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
          >
            ✕ Cerrar
          </button>
        </div>
        <div className="relative aspect-video w-full bg-black">
          {id && <div ref={holderRef} className="h-full w-full" />}
          {blocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
              <div className="text-4xl">🚫</div>
              <p className="text-sm text-neutral-300">
                Este video no se puede reproducir fuera de YouTube (bloqueado por
                el dueño del contenido).
              </p>
              <a
                href={`https://www.youtube.com/watch?v=${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand hover:underline"
              >
                Ver en YouTube ↗
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
