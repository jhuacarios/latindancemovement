'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { useQuery } from '@tanstack/react-query';
import type { SongStudy, StemKey, StemUrls } from '@baile-latino/types';
import { studioApi } from '@/lib/studio';
import { Button } from './ui';
import { clsx } from './clsx';

/**
 * Mezclador: cada instrumento separado suena en su propio <audio> (así conserva el
 * tono al bajar la velocidad, igual que el reproductor principal). El audio de
 * wavesurfer sigue siendo el reloj: se silencia y las pistas lo siguen, con
 * resincronización si se desfasan.
 *
 * La percusión llega como una sola pista; güira, bongó y tumba se ajustan con
 * filtros por banda (aproximado, igual que las franjas de instrumentos).
 */

type ChannelKey = Exclude<StemKey, 'drums'> | 'tumba' | 'bongo' | 'guira';

const CHANNELS: { key: ChannelKey; label: string; sub?: boolean }[] = [
  { key: 'vocals', label: 'Voz' },
  { key: 'guitar', label: 'Guitarra' },
  { key: 'bass', label: 'Bajo' },
  { key: 'guira', label: 'Güira', sub: true },
  { key: 'bongo', label: 'Bongó', sub: true },
  { key: 'tumba', label: 'Tumba', sub: true },
  { key: 'other', label: 'Otros' },
];

const PRESETS: { label: string; levels: Partial<Record<ChannelKey, number>> }[] = [
  { label: 'Todo', levels: {} },
  { label: 'Sin voz', levels: { vocals: 0 } },
  { label: 'Solo percusión', levels: { vocals: 0, guitar: 0, bass: 0, other: 0 } },
  { label: 'Bajo + percusión', levels: { vocals: 0, guitar: 0, other: 0 } },
  { label: 'Solo guitarra', levels: { vocals: 0, bass: 0, other: 0, guira: 0, bongo: 0, tumba: 0 } },
];

/** Desfase tolerado entre una pista y el reloj antes de corregirla (segundos). */
const MAX_DRIFT_SEC = 0.06;
const SYNC_EVERY_MS = 250;

const FULL: Record<ChannelKey, number> = {
  vocals: 1,
  guitar: 1,
  bass: 1,
  other: 1,
  tumba: 1,
  bongo: 1,
  guira: 1,
};

interface Engine {
  ctx: AudioContext;
  elements: HTMLAudioElement[];
  gains: Record<ChannelKey, GainNode>;
  dispose: () => void;
}

function withPitch(el: HTMLAudioElement) {
  // preservesPitch es estándar; Safari antiguo usa el prefijo.
  (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
  el.preservesPitch = true;
}

/** Arma el grafo de audio: una pista por instrumento y la percusión partida en 3 bandas. */
function buildEngine(urls: StemUrls): Engine {
  const ctx = new AudioContext();
  const elements: HTMLAudioElement[] = [];
  const gains = {} as Record<ChannelKey, GainNode>;

  const source = (url: string) => {
    const el = new Audio();
    el.crossOrigin = 'anonymous'; // sin esto Web Audio entrega silencio (URL firmada de otro origen)
    el.preload = 'auto';
    el.src = url;
    withPitch(el);
    elements.push(el);
    return ctx.createMediaElementSource(el);
  };
  const gain = (key: ChannelKey) => {
    const g = ctx.createGain();
    g.connect(ctx.destination);
    gains[key] = g;
    return g;
  };
  const filter = (type: BiquadFilterType, freq: number) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    return f;
  };

  for (const key of ['vocals', 'guitar', 'bass', 'other'] as const) {
    source(urls[key]).connect(gain(key));
  }

  // Percusión: cruce en 200 Hz y 4 kHz → tumba / bongó / güira (las 3 suman ≈ la pista original).
  const drums = source(urls.drums);
  drums.connect(filter('lowpass', 200)).connect(gain('tumba'));
  const midLow = filter('highpass', 200);
  drums.connect(midLow);
  midLow.connect(filter('lowpass', 4000)).connect(gain('bongo'));
  drums.connect(filter('highpass', 4000)).connect(gain('guira'));

  return {
    ctx,
    elements,
    gains,
    dispose: () => {
      for (const el of elements) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
      void ctx.close();
    },
  };
}

/** Espera a que todas las pistas puedan reproducirse sin cortes. */
function whenReady(elements: HTMLAudioElement[]): Promise<void> {
  return Promise.all(
    elements.map(
      (el) =>
        new Promise<void>((resolve, reject) => {
          if (el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return resolve();
          el.addEventListener('canplaythrough', () => resolve(), { once: true });
          el.addEventListener('error', () => reject(new Error('stem')), { once: true });
        }),
    ),
  ).then(() => undefined);
}

export function StudioMixer({
  ws,
  study,
  onRequestStems,
  requesting,
}: {
  ws: WaveSurfer | null;
  study: SongStudy;
  onRequestStems: () => void;
  requesting: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<ChannelKey, number>>(FULL);
  const [muted, setMuted] = useState<Set<ChannelKey>>(new Set());
  const [solo, setSolo] = useState<Set<ChannelKey>>(new Set());
  const engineRef = useRef<Engine | null>(null);

  // Las URLs firmadas duran 1 h: se piden al activar y se reutilizan 50 min.
  const urls = useQuery({
    queryKey: ['studio', 'stem-urls', study.id],
    queryFn: () => studioApi.stemUrls(study.id),
    enabled: enabled && study.stemsStatus === 'DONE',
    staleTime: 50 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Arma / desarma el motor.
  useEffect(() => {
    if (!enabled || !ws || !urls.data) return;
    const media = ws.getMediaElement();
    const engine = buildEngine(urls.data);
    engineRef.current = engine;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const follow = (resync: boolean) => {
      for (const el of engine.elements) {
        el.playbackRate = media.playbackRate;
        if (resync || Math.abs(el.currentTime - media.currentTime) > MAX_DRIFT_SEC) {
          el.currentTime = media.currentTime;
        }
      }
    };
    const onPlay = () => {
      void engine.ctx.resume();
      follow(true);
      for (const el of engine.elements) void el.play().catch(() => undefined);
    };
    const onPause = () => {
      for (const el of engine.elements) el.pause();
      follow(true);
    };
    const onSeek = () => follow(true);
    const onRate = () => follow(false);

    whenReady(engine.elements)
      .then(() => {
        if (cancelled) return;
        ws.setMuted(true); // el reloj sigue corriendo, en silencio
        media.addEventListener('play', onPlay);
        media.addEventListener('pause', onPause);
        media.addEventListener('seeked', onSeek);
        media.addEventListener('ratechange', onRate);
        follow(true);
        if (!media.paused) onPlay();
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError('No se pudieron cargar las pistas. Desactiva y vuelve a intentar.');
      });

    const timer = window.setInterval(() => {
      if (!media.paused) follow(false);
    }, SYNC_EVERY_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('seeked', onSeek);
      media.removeEventListener('ratechange', onRate);
      engine.dispose();
      engineRef.current = null;
      ws.setMuted(false);
    };
  }, [enabled, ws, urls.data]);

  // Volúmenes: nivel × silencio × solo.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const { key } of CHANNELS) {
      const audible = !muted.has(key) && (solo.size === 0 || solo.has(key));
      engine.gains[key].gain.setTargetAtTime(audible ? levels[key] : 0, engine.ctx.currentTime, 0.02);
    }
  }, [levels, muted, solo, loading]);

  const toggleIn = useCallback(
    (set: (fn: (s: Set<ChannelKey>) => Set<ChannelKey>) => void, key: ChannelKey) =>
      set((s) => {
        const next = new Set(s);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setLevels({ ...FULL, ...p.levels });
    setMuted(new Set());
    setSolo(new Set());
  };

  const status = study.stemsStatus;

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">🎛️ Mezclador</h2>
          <p className="text-xs text-neutral-400">
            Sube o baja cada instrumento. Las pistas son privadas: solo tú las escuchas.
          </p>
        </div>
        {status === 'DONE' && (
          <Button
            size="sm"
            variant={enabled ? 'ghost' : undefined}
            onClick={() => setEnabled((v) => !v)}
            disabled={!ws}
          >
            {enabled ? 'Volver a la canción original' : 'Usar mezclador'}
          </Button>
        )}
      </div>

      {status === null && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button size="sm" onClick={onRequestStems} disabled={requesting}>
            Separar instrumentos para mezclar
          </Button>
          <span className="text-xs text-neutral-500">Tarda un par de minutos; puedes seguir estudiando.</span>
        </div>
      )}
      {(status === 'PENDING' || status === 'PROCESSING') && (
        <p className="animate-pulse text-sm text-neutral-400">
          Separando instrumentos… (un par de minutos)
        </p>
      )}
      {status === 'ERROR' && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-red-300">
          No se pudieron separar las pistas.
          <Button size="sm" variant="ghost" onClick={onRequestStems} disabled={requesting}>
            Reintentar
          </Button>
        </div>
      )}

      {enabled && (loading || urls.isLoading) && (
        <p className="animate-pulse text-sm text-neutral-400">Cargando pistas…</p>
      )}
      {enabled && (error || urls.isError) && (
        <p className="text-sm text-red-300">{error ?? 'No se pudieron obtener las pistas.'}</p>
      )}

      {enabled && !loading && !error && urls.data && (
        <>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant="ghost" onClick={() => applyPreset(p)}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            {CHANNELS.map(({ key, label, sub }) => (
              <div key={key} className={clsx('flex items-center gap-3 text-sm', sub && 'pl-4')}>
                <span className={clsx('w-20 shrink-0', sub ? 'text-neutral-400' : 'text-neutral-200')}>
                  {sub ? `↳ ${label}` : label}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={levels[key]}
                  onChange={(e) => setLevels((l) => ({ ...l, [key]: Number(e.target.value) }))}
                  className="min-w-0 flex-1 accent-brand"
                  aria-label={`Volumen de ${label}`}
                />
                <span className="w-10 text-right tabular-nums text-xs text-neutral-400">
                  {Math.round(levels[key] * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => toggleIn(setMuted, key)}
                  aria-pressed={muted.has(key)}
                  title="Silenciar"
                  className={clsx(
                    'h-7 w-7 rounded text-xs font-semibold',
                    muted.has(key) ? 'bg-red-500/70 text-white' : 'bg-neutral-800 text-neutral-300',
                  )}
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => toggleIn(setSolo, key)}
                  aria-pressed={solo.has(key)}
                  title="Escuchar solo este"
                  className={clsx(
                    'h-7 w-7 rounded text-xs font-semibold',
                    solo.has(key) ? 'bg-clave text-selva' : 'bg-neutral-800 text-neutral-300',
                  )}
                >
                  S
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-neutral-500">
            Güira, bongó y tumba se ajustan por frecuencia dentro de la percusión (aproximado). M =
            silenciar, S = escuchar solo ese.
          </p>
        </>
      )}
    </div>
  );
}
