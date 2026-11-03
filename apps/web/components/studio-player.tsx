'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { countOfBeat, type SongEnergy, type SongStudy } from '@baile-latino/types';
import { Button } from './ui';
import { clsx } from './clsx';

// Colores de BRANDING.md (wavesurfer pinta en canvas: necesita valores, no clases).
const COLOR = {
  wave: '#244536', // line
  progress: '#4ec990', // clave
  cursor: '#e8f5e2', // sabor
  phrase: 'rgba(78, 201, 144, 0.85)',
  loop: 'rgba(182, 240, 208, 0.16)', // néctar
};

const MIN_RATE = 0.5;
const MAX_RATE = 1;
const RATE_STEP = 0.05;

/** Índice del último beat que ya sonó en `ms` (-1 si todavía no hay ninguno). */
function beatAt(beatsMs: number[], ms: number): number {
  let lo = 0;
  let hi = beatsMs.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beatsMs[mid] <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function EnergyStrip({ energy, durationMs }: { energy: SongEnergy; durationMs: number }) {
  const points = useMemo(() => {
    const pts = energy.values.map((v, i) => `${i * energy.stepMs},${(1 - v) * 100}`);
    return `0,100 ${pts.join(' ')} ${energy.values.length * energy.stepMs},100`;
  }, [energy]);
  return (
    <svg
      viewBox={`0 0 ${durationMs} 100`}
      preserveAspectRatio="none"
      className="h-10 w-full"
      aria-label="Curva de energía"
      role="img"
    >
      <polygon points={points} fill="rgba(78, 201, 144, 0.25)" stroke="#4ec990" strokeWidth={0} />
    </svg>
  );
}

export function StudioPlayer({
  study,
  audioUrl,
  onSetFirstBeat,
  savingFirstBeat,
}: {
  study: SongStudy;
  audioUrl: string;
  /** null = volver al "1" automático. */
  onSetFirstBeat: (timeMs: number | null) => void;
  savingFirstBeat: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const loopRef = useRef<{ start: number; end: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(study.durationMs ?? 0);
  const [rate, setRate] = useState(1);
  const [loop, setLoopState] = useState<{ start: number; end: number } | null>(null);

  const beats = study.beatsMs;
  const phraseStarts = study.phraseStartIndexes;
  const anchor = phraseStarts[0] ?? 0;

  const setLoop = useCallback((next: { start: number; end: number } | null) => {
    loopRef.current = next;
    setLoopState(next);
    const regions = regionsRef.current;
    if (!regions) return;
    for (const r of regions.getRegions()) if (r.id === 'loop') r.remove();
    if (next) {
      regions.addRegion({
        id: 'loop',
        start: next.start / 1000,
        end: next.end / 1000,
        color: COLOR.loop,
        drag: true,
        resize: true,
      });
    }
  }, []);

  // Crea el reproductor una vez por audio.
  useEffect(() => {
    if (!containerRef.current) return;
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: audioUrl,
      height: 120,
      waveColor: COLOR.wave,
      progressColor: COLOR.progress,
      cursorColor: COLOR.cursor,
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      dragToSeek: true,
      plugins: [regions],
    });
    wsRef.current = ws;
    regionsRef.current = regions;

    ws.on('ready', (dur) => {
      setDurationMs(Math.round(dur * 1000));
      setReady(true);
    });
    ws.on('error', () => setLoadError('No se pudo cargar el audio. Recarga la página.'));
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('timeupdate', (t) => {
      const ms = t * 1000;
      const l = loopRef.current;
      if (l && ms >= l.end) {
        ws.setTime(l.start / 1000);
        return;
      }
      setCurrentMs(ms);
    });

    // Arrastrar sobre la forma de onda define un tramo a repetir.
    regions.enableDragSelection({ color: COLOR.loop });
    regions.on('region-created', (r: Region) => {
      if (r.id === 'loop' || r.id.startsWith('phrase-')) return;
      r.remove();
      setLoop({ start: Math.round(r.start * 1000), end: Math.round(r.end * 1000) });
    });
    regions.on('region-updated', (r: Region) => {
      if (r.id !== 'loop') return;
      const next = { start: Math.round(r.start * 1000), end: Math.round(r.end * 1000) };
      loopRef.current = next;
      setLoopState(next);
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
      setReady(false);
    };
  }, [audioUrl, setLoop]);

  // Líneas en cada "1" de frase (se rehacen al corregir el 1).
  useEffect(() => {
    const regions = regionsRef.current;
    if (!ready || !regions) return;
    for (const r of regions.getRegions()) if (r.id.startsWith('phrase-')) r.remove();
    phraseStarts.forEach((beatIdx, n) => {
      const content = document.createElement('span');
      content.textContent = String(n + 1);
      content.className = 'ml-1 text-[10px] font-semibold text-clave';
      regions.addRegion({
        id: `phrase-${n}`,
        start: beats[beatIdx] / 1000,
        color: COLOR.phrase,
        content,
        drag: false,
        resize: false,
      });
    });
  }, [ready, beats, phraseStarts]);

  useEffect(() => {
    wsRef.current?.setPlaybackRate(rate, true); // true = conserva el tono
  }, [rate, ready]);

  // Posición musical actual.
  const beatIdx = beatAt(beats, currentMs);
  const count = beatIdx >= 0 ? countOfBeat(beatIdx, anchor) : null;
  const phraseIdx = beatAt(
    phraseStarts.map((i) => beats[i]),
    currentMs,
  );

  const seekToPhrase = useCallback(
    (delta: number) => {
      const ws = wsRef.current;
      if (!ws || phraseStarts.length === 0) return;
      const current = beatAt(
        phraseStarts.map((i) => beats[i]),
        ws.getCurrentTime() * 1000,
      );
      const target = Math.min(phraseStarts.length - 1, Math.max(0, current + delta));
      ws.setTime(beats[phraseStarts[target]] / 1000);
    },
    [beats, phraseStarts],
  );

  /** Repite la frase en la que va la canción (o apaga la repetición). */
  const toggleLoop = useCallback(() => {
    if (loopRef.current) return setLoop(null);
    const ws = wsRef.current;
    if (!ws || phraseStarts.length === 0) return;
    const starts = phraseStarts.map((i) => beats[i]);
    const p = Math.max(0, beatAt(starts, ws.getCurrentTime() * 1000));
    const end = starts[p + 1] ?? Math.round(ws.getDuration() * 1000);
    setLoop({ start: starts[p], end });
  }, [beats, phraseStarts, setLoop]);

  const changeRate = useCallback((delta: number) => {
    setRate((r) => Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round((r + delta) * 100) / 100)));
  }, []);

  // Atajos de teclado (no mientras se escribe en un campo).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ws = wsRef.current;
      if (!ws) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          void ws.playPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekToPhrase(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekToPhrase(1);
          break;
        case 'l':
        case 'L':
          toggleLoop();
          break;
        case '[':
          changeRate(-RATE_STEP);
          break;
        case ']':
          changeRate(RATE_STEP);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seekToPhrase, toggleLoop, changeRate]);

  return (
    <div className="space-y-4">
      {/* Conteo grande: se lee desde lejos mientras se baila. */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 px-5 py-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">Tiempo</div>
          <div
            className={clsx(
              'font-bold tabular-nums leading-none',
              'text-6xl sm:text-7xl',
              count === 1 ? 'text-clave' : 'text-sabor',
            )}
            aria-live="off"
          >
            {count ?? '–'}
            <span className="text-2xl text-neutral-600 sm:text-3xl">/8</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Frase</div>
          <div className="text-3xl font-semibold tabular-nums">
            {phraseIdx >= 0 ? phraseIdx + 1 : '–'}
            <span className="text-base text-neutral-600"> / {phraseStarts.length}</span>
          </div>
          <div className="mt-1 text-xs text-neutral-400">
            {study.bpm !== null ? `${Math.round(study.bpm)} BPM` : ''}
            {rate !== 1 && ` · a ${Math.round(rate * 100)} %`}
          </div>
        </div>
      </div>

      {/* Forma de onda + energía */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
        {!ready && !loadError && (
          <p className="py-12 text-center text-sm text-neutral-500">Cargando audio…</p>
        )}
        {loadError && <p className="py-12 text-center text-sm text-red-300">{loadError}</p>}
        <div ref={containerRef} className={clsx(!ready && 'h-0 overflow-hidden')} />
        {ready && study.energy && durationMs > 0 && (
          <div className="mt-1">
            <EnergyStrip energy={study.energy} durationMs={durationMs} />
            <div className="text-[10px] uppercase tracking-wide text-neutral-600">Energía</div>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void wsRef.current?.playPause()} disabled={!ready} className="min-w-24">
          {playing ? '⏸ Pausa' : '▶ Play'}
        </Button>
        <Button variant="ghost" onClick={() => seekToPhrase(-1)} disabled={!ready} title="Frase anterior (←)">
          ⏮ Frase
        </Button>
        <Button variant="ghost" onClick={() => seekToPhrase(1)} disabled={!ready} title="Frase siguiente (→)">
          Frase ⏭
        </Button>
        <Button
          variant="ghost"
          onClick={toggleLoop}
          disabled={!ready}
          title="Repetir la frase actual, o arrastra sobre la onda para elegir un tramo (L)"
          className={clsx(loop && 'ring-2 ring-clave')}
        >
          🔁 {loop ? 'Quitar repetición' : 'Repetir frase'}
        </Button>

        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-300">
          Velocidad
          <input
            type="range"
            min={MIN_RATE}
            max={MAX_RATE}
            step={RATE_STEP}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="accent-brand"
            aria-label="Velocidad de reproducción"
          />
          <span className="w-12 tabular-nums">{Math.round(rate * 100)} %</span>
        </label>
      </div>

      {/* Corregir el "1" */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 px-4 py-3 text-sm">
        <span className="text-neutral-300">
          ¿El 1 está corrido? Pon la canción en el 1 real y toca:
        </span>
        <Button
          size="sm"
          onClick={() => onSetFirstBeat(Math.round((wsRef.current?.getCurrentTime() ?? 0) * 1000))}
          disabled={!ready || savingFirstBeat}
        >
          Marcar el 1 acá
        </Button>
        {study.firstBeatCorrected && (
          <Button size="sm" variant="ghost" onClick={() => onSetFirstBeat(null)} disabled={savingFirstBeat}>
            Volver al automático
          </Button>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Atajos: <kbd>Espacio</kbd> play/pausa · <kbd>←</kbd> <kbd>→</kbd> frase anterior/siguiente ·{' '}
        <kbd>L</kbd> repetir · <kbd>[</kbd> <kbd>]</kbd> velocidad. Arrastra sobre la onda para
        repetir un tramo a tu medida.
      </p>
    </div>
  );
}
