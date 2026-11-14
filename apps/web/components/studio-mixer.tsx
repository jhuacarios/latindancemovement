'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
 * La campana llega como pista propia; el resto de la percusión llega junto y
 * güira, bongó y tumba se ajustan con filtros por banda (aproximado, igual que
 * las franjas de instrumentos).
 */

/** Un canal del mezclador: suma de una o más pistas, opcionalmente filtradas a una banda (Hz). */
interface Channel {
  key: string;
  label: string;
  group?: string;
  sources: { stem: StemKey; band?: [number, number] }[];
}

interface MixerLayout {
  channels: Channel[];
  presets: { label: string; off: string[] }[];
}

const one = (stem: StemKey) => [{ stem }];
const drumsBand = (lo: number, hi: number) => [{ stem: 'drums' as const, band: [lo, hi] as [number, number] }];
const NYQUIST = 24000;

/** Bachata: la percusión sin campana se parte en tumba / bongó / güira (cruces en 200 Hz y 4 kHz). */
const BACHATA: MixerLayout = {
  channels: [
    { key: 'vocals', label: 'Voz principal', group: 'Voces', sources: one('vocals') },
    { key: 'coros', label: 'Coros', group: 'Voces', sources: one('coros') },
    { key: 'requinto', label: 'Requinto', group: 'Guitarras', sources: one('requinto') },
    { key: 'segunda', label: 'Segunda', group: 'Guitarras', sources: one('segunda') },
    { key: 'bass', label: 'Bajo', sources: one('bass') },
    { key: 'bongo', label: 'Bongó', group: 'Percusión', sources: drumsBand(200, 4000) },
    { key: 'campana', label: 'Campana', group: 'Percusión', sources: one('campana') },
    { key: 'guira', label: 'Güira', group: 'Percusión', sources: drumsBand(4000, NYQUIST) },
    { key: 'tumba', label: 'Tumba', group: 'Percusión', sources: drumsBand(0, 200) },
    { key: 'keys', label: 'Teclados', sources: one('keys') },
    { key: 'other', label: 'Otros', sources: one('other') },
  ],
  presets: [
    { label: 'Todo', off: [] },
    { label: 'Sin voz', off: ['vocals', 'coros'] },
    { label: 'Sin voz principal', off: ['vocals'] },
    { label: 'Solo percusión', off: ['vocals', 'coros', 'requinto', 'segunda', 'keys', 'other', 'bass'] },
    { label: 'Bajo + percusión', off: ['vocals', 'coros', 'requinto', 'segunda', 'keys', 'other'] },
    { label: 'Solo guitarras', off: ['vocals', 'coros', 'bass', 'keys', 'other', 'bongo', 'campana', 'guira', 'tumba'] },
  ],
};

/** Salsa: piano, metales y guitarra/tres; la percusión se parte en congas / bongó-timbal / güiro (400 Hz y 4 kHz). */
const SALSA: MixerLayout = {
  channels: [
    { key: 'vocals', label: 'Sonero', group: 'Voces', sources: one('vocals') },
    { key: 'coros', label: 'Coros', group: 'Voces', sources: one('coros') },
    { key: 'keys', label: 'Piano', sources: one('keys') },
    { key: 'other', label: 'Metales', sources: one('other') },
    { key: 'guitar', label: 'Guitarra / tres', sources: [{ stem: 'requinto' }, { stem: 'segunda' }] },
    { key: 'bass', label: 'Bajo', sources: one('bass') },
    { key: 'conga', label: 'Congas', group: 'Percusión', sources: drumsBand(0, 400) },
    { key: 'bongo', label: 'Bongó / timbal', group: 'Percusión', sources: drumsBand(400, 4000) },
    { key: 'campana', label: 'Campana', group: 'Percusión', sources: one('campana') },
    { key: 'guira', label: 'Güiro / maracas', group: 'Percusión', sources: drumsBand(4000, NYQUIST) },
  ],
  presets: [
    { label: 'Todo', off: [] },
    { label: 'Sin voz', off: ['vocals', 'coros'] },
    { label: 'Solo percusión', off: ['vocals', 'coros', 'keys', 'other', 'guitar', 'bass'] },
    { label: 'Bajo + percusión', off: ['vocals', 'coros', 'keys', 'other', 'guitar'] },
    { label: 'Piano + bajo', off: ['vocals', 'coros', 'other', 'guitar', 'conga', 'bongo', 'campana', 'guira'] },
    { label: 'Sin metales', off: ['other'] },
  ],
};

const LAYOUTS: Record<string, MixerLayout> = { BACHATA, SALSA };
const layoutFor = (style: string) => LAYOUTS[style] ?? BACHATA;
const fullLevels = (layout: MixerLayout) => Object.fromEntries(layout.channels.map((c) => [c.key, 1]));

/** Desfase tolerado entre una pista y el reloj antes de corregirla (segundos). */
const MAX_DRIFT_SEC = 0.06;
const SYNC_EVERY_MS = 250;

interface Engine {
  ctx: AudioContext;
  elements: HTMLAudioElement[];
  gains: Record<string, GainNode>;
  dispose: () => void;
}

function withPitch(el: HTMLAudioElement) {
  // preservesPitch es estándar; Safari antiguo usa el prefijo.
  (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
  el.preservesPitch = true;
}

/** Arma el grafo de audio: un <audio> por pista, y cada canal suma sus pistas (o una banda de ellas). */
function buildEngine(urls: StemUrls, layout: MixerLayout): Engine {
  const ctx = new AudioContext();
  const elements: HTMLAudioElement[] = [];
  const gains: Record<string, GainNode> = {};
  const sources = new Map<StemKey, MediaElementAudioSourceNode>();

  const source = (stem: StemKey) => {
    const existing = sources.get(stem);
    if (existing) return existing;
    const el = new Audio();
    el.crossOrigin = 'anonymous'; // sin esto Web Audio entrega silencio (URL firmada de otro origen)
    el.preload = 'auto';
    el.src = urls[stem];
    withPitch(el);
    elements.push(el);
    const node = ctx.createMediaElementSource(el);
    sources.set(stem, node);
    return node;
  };
  const filter = (type: BiquadFilterType, freq: number) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    return f;
  };

  for (const channel of layout.channels) {
    const g = ctx.createGain();
    g.connect(ctx.destination);
    gains[channel.key] = g;
    for (const { stem, band } of channel.sources) {
      let node: AudioNode = source(stem);
      if (band && band[0] > 0) node = node.connect(filter('highpass', band[0]));
      if (band && band[1] < NYQUIST) node = node.connect(filter('lowpass', band[1]));
      node.connect(g);
    }
  }

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
  const layout = layoutFor(study.style);
  const [levels, setLevels] = useState<Record<string, number>>(() => fullLevels(layout));
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [solo, setSolo] = useState<Set<string>>(new Set());
  const engineRef = useRef<Engine | null>(null);
  const qc = useQueryClient();

  // Las URLs firmadas duran 1 h: se piden al activar y se reutilizan 50 min.
  const urls = useQuery({
    queryKey: ['studio', 'stem-urls', study.id],
    queryFn: () => studioApi.stemUrls(study.id),
    enabled: enabled && study.stemsStatus === 'DONE',
    staleTime: 50 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Pistas de una versión anterior (sin los instrumentos nuevos): la API las marca para
  // prepararlas de nuevo; se refresca el estudio para que aparezca el botón.
  useEffect(() => {
    if (!urls.isError) return;
    setEnabled(false);
    void qc.invalidateQueries({ queryKey: ['studio', 'audio-file', study.id] });
  }, [urls.isError, qc, study.id]);

  // Arma / desarma el motor.
  useEffect(() => {
    if (!enabled || !ws || !urls.data) return;
    const media = ws.getMediaElement();
    const engine = buildEngine(urls.data, layout);
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
  }, [enabled, ws, urls.data, layout]);

  // Volúmenes: nivel × silencio × solo.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const { key } of layout.channels) {
      const audible = !muted.has(key) && (solo.size === 0 || solo.has(key));
      engine.gains[key].gain.setTargetAtTime(audible ? levels[key] : 0, engine.ctx.currentTime, 0.02);
    }
  }, [levels, muted, solo, loading]);

  const toggleIn = useCallback(
    (set: (fn: (s: Set<string>) => Set<string>) => void, key: string) =>
      set((s) => {
        const next = new Set(s);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  const applyPreset = (p: MixerLayout['presets'][number]) => {
    setLevels({ ...fullLevels(layout), ...Object.fromEntries(p.off.map((k) => [k, 0])) });
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
          {urls.error && <p className="w-full text-xs text-amber-300">{urls.error.message}</p>}
          <Button size="sm" onClick={onRequestStems} disabled={requesting}>
            Separar instrumentos para mezclar
          </Button>
          <span className="text-xs text-neutral-500">Tarda varios minutos (hasta ~10); puedes seguir estudiando.</span>
        </div>
      )}
      {(status === 'PENDING' || status === 'PROCESSING') && (
        <p className="animate-pulse text-sm text-neutral-400">
          Separando instrumentos… (varios minutos, hasta ~10)
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
            {layout.presets.map((p) => (
              <Button key={p.label} size="sm" variant="ghost" onClick={() => applyPreset(p)}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            {layout.channels.map(({ key, label, group }, i) => (
              <div key={key}>
                {group && group !== layout.channels[i - 1]?.group && (
                  <p className="pb-1 pt-1 text-[11px] uppercase tracking-wide text-neutral-500">{group}</p>
                )}
              <div className={clsx('flex items-center gap-3 text-sm', group && 'pl-3')}>
                <span className="w-24 shrink-0 text-neutral-200">{label}</span>
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
              </div>
            ))}
          </div>
          <p className="text-[11px] text-neutral-500">
            Los coros, las guitarras y cada instrumento de percusión son aproximados: se separan a partir de
            la voz, la guitarra y la percusión. M = silenciar, S = escuchar solo ese.
          </p>
        </>
      )}
    </div>
  );
}
