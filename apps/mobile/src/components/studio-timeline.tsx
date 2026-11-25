import { memo, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Polygon, Rect } from 'react-native-svg';
import type {
  InstrumentKey,
  SongEnergy,
  SongInstruments,
  SongMarkerDto,
  SongSectionDto,
  SongSectionType,
} from '@baile-latino/types';
import { colors, radius } from '@/lib/theme';

export const SECTION_LABEL: Record<SongSectionType, string> = {
  INTRO: 'Intro',
  VERSO: 'Verso',
  CORO: 'Coro',
  DERECHO: 'Derecho',
  MAJAO: 'Majao',
  MONTUNO: 'Montuno',
  MAMBO: 'Mambo',
  SOLO: 'Solo',
  PUENTE: 'Puente',
  OUTRO: 'Outro',
  OTRO: 'Otro',
};

const SECTION_COLOR: Record<SongSectionType, string> = {
  INTRO: '#244536',
  VERSO: '#1a7a4e88',
  CORO: '#1a7a4ebb',
  DERECHO: '#1a7a4e88',
  MAJAO: '#d9770688',
  MONTUNO: '#04785799',
  MAMBO: '#f59e0b99',
  SOLO: '#be123c88',
  PUENTE: '#07598599',
  OUTRO: '#244536',
  OTRO: '#3f5a4d',
};

interface Lane {
  key: InstrumentKey;
  label: string;
  color: string;
}

/** Franjas por estilo (las mismas de la web). Se muestran solo las que trae el análisis. */
const BACHATA_LANES: Lane[] = [
  { key: 'vocals', label: 'Voz', color: '#b6f0d0' },
  { key: 'coros', label: 'Coros', color: '#8fe0b8' },
  { key: 'requinto', label: 'Requinto', color: '#4ec990' },
  { key: 'segunda', label: 'Segunda', color: '#3aa877' },
  { key: 'guitar', label: 'Guitarra', color: '#4ec990' },
  { key: 'bass', label: 'Bajo', color: '#7baf8e' },
  { key: 'bongo', label: 'Bongó', color: '#f59e0b' },
  { key: 'campana', label: 'Campana', color: '#fde68a' },
  { key: 'guira', label: 'Güira', color: '#fbbf24' },
  { key: 'tumba', label: 'Tumba', color: '#d97706' },
  { key: 'keys', label: 'Teclados', color: '#a5b4fc' },
  { key: 'other', label: 'Otros', color: '#8aa39a' },
];
const SALSA_LANES: Lane[] = [
  { key: 'vocals', label: 'Sonero', color: '#b6f0d0' },
  { key: 'coros', label: 'Coros', color: '#8fe0b8' },
  { key: 'keys', label: 'Piano', color: '#a5b4fc' },
  { key: 'other', label: 'Metales', color: '#fca5a5' },
  { key: 'guitar', label: 'Guitarra / tres', color: '#4ec990' },
  { key: 'bass', label: 'Bajo', color: '#7baf8e' },
  { key: 'conga', label: 'Congas', color: '#f59e0b' },
  { key: 'bongo', label: 'Bongó / timbal', color: '#fbbf24' },
  { key: 'campana', label: 'Campana', color: '#fde68a' },
  { key: 'guira', label: 'Güiro / maracas', color: '#d97706' },
];

function visibleLanes(style: string, tracks: SongInstruments['tracks']): Lane[] {
  if (style === 'SALSA') return SALSA_LANES.filter((l) => tracks[l.key] !== undefined);
  const split = tracks.requinto !== undefined;
  return BACHATA_LANES.filter((l) => tracks[l.key] !== undefined && !(split && l.key === 'guitar')).map((l) =>
    l.key === 'vocals' && tracks.coros !== undefined ? { ...l, label: 'Voz principal' } : l,
  );
}

/** En el teléfono hay pocos píxeles: cada franja se reduce a este máximo de bloques. */
const MAX_BINS = 160;
const LANE_H = 14;

function downsample(values: number[], bins: number): number[] {
  if (values.length <= bins) return values;
  const out: number[] = [];
  const per = values.length / bins;
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    let n = 0;
    for (let i = Math.floor(b * per); i < Math.floor((b + 1) * per); i++) {
      sum += values[i];
      n++;
    }
    out.push(n ? sum / n : 0);
  }
  return out;
}

const Lanes = memo(function Lanes({
  style,
  instruments,
  durationMs,
  width,
}: {
  style: string;
  instruments: SongInstruments;
  durationMs: number;
  width: number;
}) {
  const lanes = visibleLanes(style, instruments.tracks);
  const rows = useMemo(
    () =>
      lanes.map((lane) => {
        const raw = instruments.tracks[lane.key] ?? [];
        const coveredMs = raw.length * instruments.stepMs;
        const bins = downsample(raw, MAX_BINS);
        const binW = (Math.min(coveredMs, durationMs) / durationMs) * (width / Math.max(1, bins.length));
        return { lane, bins, binW };
      }),
    [lanes, instruments, durationMs, width],
  );
  if (width <= 0) return null;
  return (
    <View>
      <Svg width={width} height={rows.length * (LANE_H + 2)}>
        {rows.map(({ lane, bins, binW }, r) =>
          bins.map((v, i) =>
            v < 0.05 ? null : (
              <Rect
                key={`${lane.key}-${i}`}
                x={i * binW}
                y={r * (LANE_H + 2)}
                width={binW + 0.5}
                height={LANE_H}
                fill={lane.color}
                fillOpacity={v}
              />
            ),
          ),
        )}
      </Svg>
      {rows.map(({ lane }, r) => (
        <Text key={lane.key} style={[styles.laneLabel, { top: r * (LANE_H + 2) }]} pointerEvents="none">
          {lane.label}
        </Text>
      ))}
    </View>
  );
});

const EnergyStrip = memo(function EnergyStrip({
  energy,
  durationMs,
  width,
  height,
  phraseMs,
}: {
  energy: SongEnergy | null;
  durationMs: number;
  width: number;
  height: number;
  phraseMs: number[];
}) {
  const points = useMemo(() => {
    if (!energy || width <= 0) return '';
    const vals = downsample(energy.values, 300);
    const step = (energy.values.length * energy.stepMs) / vals.length;
    const x = (ms: number) => (ms / durationMs) * width;
    const pts = vals.map((v, i) => `${x(i * step)},${(1 - v) * height}`);
    return `0,${height} ${pts.join(' ')} ${x(vals.length * step)},${height}`;
  }, [energy, durationMs, width, height]);
  if (width <= 0) return null;
  return (
    <Svg width={width} height={height}>
      {points ? <Polygon points={points} fill="#4ec99040" stroke="#4ec990" strokeWidth={1} /> : null}
      {phraseMs.map((ms, i) => {
        const x = (ms / durationMs) * width;
        return <Line key={i} x1={x} x2={x} y1={0} y2={height} stroke="#4ec990" strokeOpacity={0.55} strokeWidth={1} />;
      })}
    </Svg>
  );
});

/**
 * Línea de tiempo de la canción: secciones (tocar = saltar), energía con una línea
 * en cada "1" de frase, franjas de instrumentos y el cursor. Tocar o arrastrar
 * sobre la energía salta a ese punto.
 */
export function StudioTimeline({
  style,
  durationMs,
  currentMs,
  energy,
  phraseMs,
  changesMs = [],
  sections,
  markers,
  instruments,
  loop,
  onSeek,
}: {
  style: string;
  durationMs: number;
  currentMs: number;
  energy: SongEnergy | null;
  phraseMs: number[];
  /** Cambios de tiempo ("desde acá el 1 es este"): se marcan en otro color. */
  changesMs?: number[];
  sections: SongSectionDto[];
  markers: SongMarkerDto[];
  instruments: SongInstruments | null;
  loop: { start: number; end: number } | null;
  onSeek: (ms: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const widthRef = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };
  const msAt = (e: GestureResponderEvent) =>
    Math.max(0, Math.min(durationMs, (e.nativeEvent.locationX / Math.max(1, widthRef.current)) * durationMs));
  const shownMs = scrubMs ?? currentMs;
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / durationMs) * 100))}%` as const;
  const breaks = markers.filter((m) => m.type === 'BREAK');

  return (
    <View onLayout={onLayout} style={{ gap: 6 }}>
      {sections.length > 0 && (
        <View style={styles.sections}>
          {sections.map((s) => {
            const active = shownMs >= s.startMs && shownMs < s.endMs;
            return (
              <Pressable
                key={s.id}
                onPress={() => onSeek(s.startMs)}
                style={[
                  styles.section,
                  {
                    left: pct(s.startMs),
                    width: pct(Math.min(s.endMs, durationMs) - s.startMs),
                    backgroundColor: SECTION_COLOR[s.type],
                  },
                  active && { borderColor: colors.text, borderWidth: 1 },
                ]}
                accessibilityLabel={`${SECTION_LABEL[s.type]}, ir al inicio`}
              >
                <Text style={styles.sectionText} numberOfLines={1}>
                  {SECTION_LABEL[s.type]}
                </Text>
              </Pressable>
            );
          })}
          {breaks.map((m) => (
            <View key={m.id} style={[styles.break, { left: pct(m.timeMs) }]} pointerEvents="none" />
          ))}
        </View>
      )}

      <View
        style={styles.energy}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setScrubMs(msAt(e))}
        onResponderMove={(e) => setScrubMs(msAt(e))}
        onResponderRelease={(e) => {
          onSeek(msAt(e));
          setScrubMs(null);
        }}
        accessibilityLabel="Línea de tiempo: toca para saltar"
      >
        <View pointerEvents="none">
          <EnergyStrip energy={energy} durationMs={durationMs} width={width} height={56} phraseMs={phraseMs} />
        </View>
        {changesMs.map((ms) => (
          <View key={ms} pointerEvents="none" style={[styles.change, { left: pct(ms) }]} />
        ))}
        {loop && (
          <View
            pointerEvents="none"
            style={[styles.loop, { left: pct(loop.start), width: pct(loop.end - loop.start) }]}
          />
        )}
        <View pointerEvents="none" style={[styles.cursor, { left: pct(shownMs) }]} />
      </View>

      {instruments && (
        <View pointerEvents="none">
          <Lanes style={style} instruments={instruments} durationMs={durationMs} width={width} />
          <View style={[styles.cursor, { left: pct(shownMs) }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { height: 26, position: 'relative' },
  section: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
    paddingHorizontal: 3,
    justifyContent: 'center',
    overflow: 'hidden',
    borderRightWidth: 1,
    borderRightColor: colors.selva,
  },
  sectionText: { color: colors.text, fontSize: 10, fontWeight: '600' },
  break: { position: 'absolute', top: -2, bottom: -2, width: 3, marginLeft: -1.5, borderRadius: 2, backgroundColor: '#f87171' },
  energy: {
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: '#00000033',
    overflow: 'hidden',
  },
  loop: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#b6f0d02e' },
  change: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1.5, backgroundColor: '#fbbf24' },
  cursor: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colors.text },
  laneLabel: {
    position: 'absolute',
    left: 3,
    fontSize: 9,
    lineHeight: LANE_H,
    color: colors.text,
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
});
