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

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [audio, setAudio] = useState<Track | null>(null);
  const [video, setVideo] = useState<Track | null>(null);
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

  return (
    <PlayerContext.Provider value={{ playAudio, playVideo, canPlay, isBlocked }}>
      {children}
      {audio && (
        <AudioBar
          key={`${audio.source}:${audio.sourceId}`}
          track={audio}
          onClose={() => setAudio(null)}
          onBlocked={reportBlocked}
        />
      )}
      {video && (
        <VideoModal
          key={`${video.source}:${video.sourceId}`}
          track={video}
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
  onClose,
  onBlocked,
}: {
  track: Track;
  onClose: () => void;
  onBlocked: (track: Track) => void;
}) {
  const id = ytId(track);
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
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

// --- Modal de video --------------------------------------------------------
function VideoModal({
  track,
  onClose,
  onBlocked,
}: {
  track: Track;
  onClose: () => void;
  onBlocked: (track: Track) => void;
}) {
  const id = ytId(track);
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
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
    loadYTApi().then(() => {
      if (destroyed || !holderRef.current) return;
      playerRef.current = new window.YT.Player(holderRef.current, {
        videoId: id,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e: any) => e.target.playVideo(),
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
