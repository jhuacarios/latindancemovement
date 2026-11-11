'use client';

import { memo } from 'react';
import type {
  InstrumentKey,
  SongInstruments,
  SongMarkerDto,
  SongSectionDto,
  SongSectionType,
} from '@baile-latino/types';

/** Orden y nombre de las franjas (de lo melódico a la percusión). */
const LANES: { key: InstrumentKey; label: string; color: string }[] = [
  { key: 'vocals', label: 'Voz', color: '#b6f0d0' }, // néctar
  { key: 'guitar', label: 'Guitarra', color: '#4ec990' }, // clave
  { key: 'bass', label: 'Bajo', color: '#7baf8e' }, // muted
  { key: 'bongo', label: 'Bongó', color: '#f59e0b' }, // bachata
  { key: 'guira', label: 'Güira', color: '#fbbf24' },
  { key: 'tumba', label: 'Tumba', color: '#d97706' },
  { key: 'other', label: 'Otros', color: '#8aa39a' },
];

export const SECTION_LABEL: Record<SongSectionType, string> = {
  INTRO: 'Intro',
  VERSO: 'Verso',
  CORO: 'Coro',
  DERECHO: 'Derecho',
  MAJAO: 'Majao',
  MAMBO: 'Mambo',
  PUENTE: 'Puente',
  OUTRO: 'Outro',
  OTRO: 'Otro',
};

const SECTION_COLOR: Record<SongSectionType, string> = {
  INTRO: 'bg-neutral-800 text-neutral-300',
  VERSO: 'bg-son/50 text-sabor',
  CORO: 'bg-son/70 text-sabor',
  DERECHO: 'bg-son/50 text-sabor',
  MAJAO: 'bg-amber-600/50 text-amber-50',
  MAMBO: 'bg-amber-500/60 text-amber-50',
  PUENTE: 'bg-sky-800/60 text-sky-100',
  OUTRO: 'bg-neutral-800 text-neutral-300',
  OTRO: 'bg-neutral-700 text-neutral-200',
};

/** Una franja: cada paso es un rectángulo cuya opacidad es la actividad del instrumento. */
const Lane = memo(function Lane({
  values,
  stepMs,
  durationMs,
  color,
}: {
  values: number[];
  stepMs: number;
  durationMs: number;
  color: string;
}) {
  return (
    <svg viewBox={`0 0 ${durationMs} 1`} preserveAspectRatio="none" className="h-4 w-full" aria-hidden>
      {values.map((v, i) =>
        v < 0.05 ? null : (
          <rect key={i} x={i * stepMs} y={0} width={stepMs + 1} height={1} fill={color} fillOpacity={v} />
        ),
      )}
    </svg>
  );
});

/** Qué instrumento suena en cada momento, alineado con la forma de onda. */
export function InstrumentLanes({
  instruments,
  durationMs,
  currentMs,
}: {
  instruments: SongInstruments;
  durationMs: number;
  currentMs: number;
}) {
  return (
    <div className="relative mt-2 space-y-0.5" role="img" aria-label="Instrumentos a lo largo de la canción">
      {LANES.map((lane) => (
        <div key={lane.key} className="relative rounded-sm bg-neutral-950/40">
          <Lane
            values={instruments.tracks[lane.key] ?? []}
            stepMs={instruments.stepMs}
            durationMs={durationMs}
            color={lane.color}
          />
          <span className="pointer-events-none absolute left-1 top-0 text-[10px] leading-4 text-neutral-300 [text-shadow:0_0_3px_#000]">
            {lane.label}
          </span>
        </div>
      ))}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-sabor/80"
        style={{ left: `${Math.min(100, (currentMs / durationMs) * 100)}%` }}
      />
      <p className="pt-1 text-[10px] text-neutral-600">
        Instrumentos (aprox.): la güira, el bongó y la tumba se estiman por frecuencia dentro de la percusión.
      </p>
    </div>
  );
}

/** Barra de secciones (derecho, mambo…) y breaks. Tocar una sección salta a su inicio. */
export function SectionBar({
  sections,
  markers,
  durationMs,
  currentMs,
  onSeek,
}: {
  sections: SongSectionDto[];
  markers: SongMarkerDto[];
  durationMs: number;
  currentMs: number;
  onSeek: (ms: number) => void;
}) {
  const breaks = markers.filter((m) => m.type === 'BREAK');
  return (
    <div className="relative mt-2 h-6">
      {sections.map((s) => {
        const active = currentMs >= s.startMs && currentMs < s.endMs;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSeek(s.startMs)}
            title={`${SECTION_LABEL[s.type]}${s.origin === 'AUTOMATICO' ? ' (automático)' : ''}`}
            className={`absolute inset-y-0 overflow-hidden rounded-sm border-r border-selva px-1 text-left text-[11px] font-medium ${SECTION_COLOR[s.type]} ${active ? 'ring-1 ring-sabor' : ''}`}
            style={{
              left: `${(s.startMs / durationMs) * 100}%`,
              width: `${((Math.min(s.endMs, durationMs) - s.startMs) / durationMs) * 100}%`,
            }}
          >
            {SECTION_LABEL[s.type]}
          </button>
        );
      })}
      {breaks.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onSeek(m.timeMs)}
          title="Break"
          aria-label={`Break en ${Math.round(m.timeMs / 1000)} s`}
          className="absolute -top-1 h-8 w-1 -translate-x-1/2 rounded-full bg-red-400 hover:bg-red-300"
          style={{ left: `${(m.timeMs / durationMs) * 100}%` }}
        />
      ))}
    </div>
  );
}
