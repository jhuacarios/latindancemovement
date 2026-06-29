'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Track } from '@baile-latino/types';
import { api } from '@/lib/api';

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

  // Reserva espacio al final del contenido cuando la barra de audio está visible,
  // para que no tape las últimas filas (en cualquier sección de la app).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--player-bar-h', audio ? '5.5rem' : '0px');
    return () => root.style.setProperty('--player-bar-h', '0px');
  }, [audio]);

  const cur = audio ?? video;
  const playingKey = cur ? `${cur.source}:${cur.sourceId}` : null;

  return (
    <PlayerContext.Provider
      value={{ playAudio, playVideo, canPlay, isBlocked, playingKey }}
    >
      {children}
      {audio && (
        <AudioBar
          key={`${audio.source}:${audio.sourceId}`}
          track={audio}
          volume={volume}
          setVolume={setVolume}
          onClose={() => setAudio(null)}
          onBlocked={reportBlocked}
        />
      )}
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
function AudioBar({
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
  // Ref al volumen para aplicarlo en onReady sin recrear el player.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [blocked, setBlocked] = useState(false);

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
            e.target.setVolume(volumeRef.current); // mantiene el último volumen
            e.target.playVideo();
          },
          onStateChange: (e: any) => {
            const YT = window.YT;
            setPlaying(e.data === YT.PlayerState.PLAYING);
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
      clearInterval(interval);
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
    };
    // seeking intencionalmente fuera: el intervalo lee la ref, no recrea el player
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4">
        <span className="text-lg text-brand">♪</span>
        <div className="min-w-0 w-48 shrink-0">
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
              className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
              title={playing ? 'Pausar' : 'Reproducir'}
            >
              {playing ? '⏸' : '▶'}
            </button>

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
          className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
        >
          ⏹ Detener
        </button>
      </div>

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
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
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
