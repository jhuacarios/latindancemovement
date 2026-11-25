import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { countOfBeat, type SeparationMode, type SongStudy } from '@baile-latino/types';
import { Button } from '@/components/button';
import { StudioMixer, seekExact } from '@/components/studio-mixer';
import { SECTION_LABEL, StudioTimeline } from '@/components/studio-timeline';
import { ApiError } from '@/lib/api';
import { IN_PROGRESS, SEPARATION_IN_PROGRESS, formatDuration, indexAt, studioApi } from '@/lib/studio';
import { colors, detailHeader, radius, space, ui } from '@/lib/theme';

const MIN_RATE = 0.5;
const MAX_RATE = 1;
const RATE_STEP = 0.05;
/** Cuántas frases de 8 repetir. */
const LOOP_LENGTHS = [1, 2, 4];

/** Una canción del Estudio: análisis + reproductor para practicar. */
export default function StudioSongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ['studio', 'audio-file', id];

  const study = useQuery({
    queryKey: key,
    queryFn: () => studioApi.get(id),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      if (IN_PROGRESS.has(d.status)) return 3000;
      if (d.instrumentsStatus && SEPARATION_IN_PROGRESS.has(d.instrumentsStatus)) return 10_000;
      if (d.stemsStatus && SEPARATION_IN_PROGRESS.has(d.stemsStatus)) return 10_000;
      if (d.instrumentsMode === 'BASIC') return 30_000;
      return false;
    },
  });
  // La URL firmada dura 1 h: no se refresca sola (cortaría la reproducción).
  const audio = useQuery({
    queryKey: ['studio', 'audio-url', id],
    queryFn: () => studioApi.playbackUrl(id),
    enabled: study.data?.status === 'READY',
    staleTime: 50 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const firstBeat = useMutation({
    mutationFn: (timeMs: number | null) => studioApi.setFirstBeat(id, timeMs),
    onSuccess: (updated) => qc.setQueryData(key, updated),
  });
  const stems = useMutation({
    mutationFn: (mode: SeparationMode) => studioApi.requestStems(id, mode),
    onSuccess: (updated) => qc.setQueryData(key, updated),
  });
  const reanalyze = useMutation({
    mutationFn: () => studioApi.reanalyze(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studio'] }),
  });

  const s = study.data;
  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ ...detailHeader, title: s?.originalName ?? 'Canción', headerBackTitle: 'Estudio' }} />
      <ScrollView contentContainerStyle={ui.scroll}>
        {s && (
          <View style={styles.titleRow}>
            <Text style={[ui.small, { flex: 1 }]}>
              {s.bpm !== null && `${Math.round(s.bpm)} BPM · `}
              {formatDuration(s.durationMs)} · {s.phraseStartIndexes.length} frases de 8
            </Text>
            {(s.status === 'READY' || s.status === 'ERROR') && (
              <Pressable onPress={() => reanalyze.mutate()} disabled={reanalyze.isPending} hitSlop={8}>
                <Text style={{ color: colors.clave, fontSize: 13 }}>Re-analizar</Text>
              </Pressable>
            )}
          </View>
        )}
        {study.isLoading && <ActivityIndicator color={colors.clave} />}
        {study.isError && (
          <Text style={ui.error}>{study.error instanceof ApiError ? study.error.message : 'No se pudo cargar la canción.'}</Text>
        )}
        {s && IN_PROGRESS.has(s.status) && (
          <View style={styles.rowCenter}>
            <ActivityIndicator color={colors.clave} />
            <Text style={ui.muted}>Analizando la canción… (menos de un minuto)</Text>
          </View>
        )}
        {s?.status === 'ERROR' && <Text style={ui.error}>{s.error}</Text>}
        {firstBeat.isError && (
          <Text style={ui.error}>{firstBeat.error instanceof ApiError ? firstBeat.error.message : 'No se pudo guardar el 1.'}</Text>
        )}
        {s?.status === 'READY' && audio.data && (
          <Player
            study={s}
            audioUrl={audio.data.url}
            onSetFirstBeat={(t) => firstBeat.mutate(t)}
            savingFirstBeat={firstBeat.isPending}
            onRequestStems={(m) => stems.mutate(m)}
            requestingStems={stems.isPending}
            requestStemsError={stems.error instanceof Error ? stems.error.message : null}
          />
        )}
      </ScrollView>
    </View>
  );
}

function Player({
  study,
  audioUrl,
  onSetFirstBeat,
  savingFirstBeat,
  onRequestStems,
  requestingStems,
  requestStemsError,
}: {
  study: SongStudy;
  audioUrl: string;
  onSetFirstBeat: (timeMs: number | null) => void;
  savingFirstBeat: boolean;
  onRequestStems: (mode: SeparationMode) => void;
  requestingStems: boolean;
  requestStemsError: string | null;
}) {
  const player = useAudioPlayer({ uri: audioUrl }, { updateInterval: 50 });
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const [loopLen, setLoopLen] = useState(1);

  // Que suene aunque el iPhone esté en silencio.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);
  useEffect(() => {
    player.setPlaybackRate(rate, 'high'); // conserva el tono
  }, [player, rate, status.isLoaded]);

  const currentMs = status.currentTime * 1000;
  const durationMs = status.duration > 0 ? status.duration * 1000 : (study.durationMs ?? 0);
  const beats = study.beatsMs;
  const phraseStarts = study.phraseStartIndexes;
  const phraseMs = useMemo(() => phraseStarts.map((i) => beats[i]), [beats, phraseStarts]);

  // Repetición: al pasar el final del tramo vuelve al inicio.
  // (un salto a la vez: el estado llega cada 50 ms y el salto exacto tarda un poco más)
  const loopSeeking = useRef(false);
  useEffect(() => {
    if (!loop || !status.playing || currentMs < loop.end || loopSeeking.current) return;
    loopSeeking.current = true;
    void seekExact(player, loop.start / 1000).finally(() => {
      loopSeeking.current = false;
    });
  }, [loop, currentMs, status.playing, player]);

  const seek = useCallback((ms: number) => void seekExact(player, ms / 1000), [player]);

  const beatIdx = indexAt(beats, currentMs);
  const count = beatIdx >= 0 ? countOfBeat(beatIdx, phraseStarts[0] ?? 0) : null;
  const phraseIdx = indexAt(phraseMs, currentMs);
  const section = study.sections.find((x) => currentMs >= x.startMs && currentMs < x.endMs);

  const loopFrom = (p: number, len: number) => {
    const start = phraseMs[p];
    const end = phraseMs[p + len] ?? durationMs;
    setLoop({ start, end });
  };
  const toggleLoop = () => {
    if (loop) return setLoop(null);
    if (phraseMs.length === 0) return;
    loopFrom(Math.max(0, phraseIdx), loopLen);
  };
  const changeLoopLen = (len: number) => {
    setLoopLen(len);
    if (loop) loopFrom(Math.max(0, indexAt(phraseMs, loop.start)), len);
  };
  const seekToPhrase = (delta: number) => {
    if (phraseMs.length === 0) return;
    const target = Math.min(phraseMs.length - 1, Math.max(0, phraseIdx + delta));
    seek(phraseMs[target]);
  };
  const changeRate = (d: number) =>
    setRate((r) => Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round((r + d) * 100) / 100)));

  return (
    <View style={{ gap: space.lg }}>
      {/* Conteo grande: se lee desde lejos mientras se baila. */}
      <View style={styles.counter}>
        <View>
          <Text style={styles.caption}>Tiempo</Text>
          <Text style={[styles.count, count === 1 && { color: colors.clave }]}>
            {count ?? '–'}
            <Text style={styles.countOf}>/8</Text>
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.caption}>Frase</Text>
          <Text style={styles.phrase}>
            {phraseIdx >= 0 ? phraseIdx + 1 : '–'}
            <Text style={styles.countOf}> / {phraseStarts.length}</Text>
          </Text>
          {section && <Text style={styles.section}>{SECTION_LABEL[section.type]}</Text>}
          <Text style={ui.small}>
            {study.bpm !== null ? `${Math.round(study.bpm)} BPM` : ''}
            {rate !== 1 ? ` · a ${Math.round(rate * 100)} %` : ''}
          </Text>
        </View>
      </View>

      <View style={ui.card}>
        {!status.isLoaded ? (
          <View style={styles.rowCenter}>
            <ActivityIndicator color={colors.clave} />
            <Text style={ui.muted}>Cargando audio…</Text>
          </View>
        ) : (
          durationMs > 0 && (
            <StudioTimeline
              style={study.style}
              durationMs={durationMs}
              currentMs={currentMs}
              energy={study.energy}
              phraseMs={phraseMs}
              sections={study.sections}
              markers={study.markers}
              instruments={study.instruments}
              loop={loop}
              onSeek={seek}
            />
          )
        )}
        <Text style={ui.small}>
          {formatDuration(currentMs)} / {formatDuration(durationMs)}
        </Text>
        {(study.instrumentsStatus === 'PENDING' || study.instrumentsStatus === 'PROCESSING') && (
          <Text style={ui.small}>Detectando instrumentos y secciones… (ya puedes ir estudiando)</Text>
        )}
        {study.instrumentsStatus === 'DONE' && study.instrumentsMode === 'BASIC' && (
          <Text style={ui.small}>Primer análisis rápido listo. Afinando coros, requinto, segunda y campana…</Text>
        )}
        {study.instrumentsStatus === 'ERROR' && (
          <Text style={[ui.small, { color: colors.danger }]}>
            No se pudieron detectar los instrumentos. Prueba con “Re-analizar”.
          </Text>
        )}
      </View>

      {/* Controles */}
      <View style={styles.controls}>
        <RoundButton label="⏮" hint="Frase anterior" onPress={() => seekToPhrase(-1)} />
        <Pressable
          onPress={() => (status.playing ? player.pause() : player.play())}
          disabled={!status.isLoaded}
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.8 }]}
          accessibilityLabel={status.playing ? 'Pausa' : 'Reproducir'}
        >
          <Text style={styles.playText}>{status.playing ? '⏸' : '▶'}</Text>
        </Pressable>
        <RoundButton label="⏭" hint="Frase siguiente" onPress={() => seekToPhrase(1)} />
      </View>

      <View style={ui.card}>
        <View style={styles.rowBetween}>
          <Text style={ui.body}>🔁 Repetir</Text>
          <View style={styles.chips}>
            {LOOP_LENGTHS.map((n) => (
              <Pressable key={n} onPress={() => changeLoopLen(n)} style={[styles.chip, loopLen === n && styles.chipOn]}>
                <Text style={[styles.chipText, loopLen === n && { color: colors.white }]}>
                  {n} {n === 1 ? 'frase' : 'frases'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Button
          title={loop ? 'Quitar repetición' : 'Repetir desde esta frase'}
          variant={loop ? 'ghost' : 'primary'}
          onPress={toggleLoop}
          disabled={!status.isLoaded || phraseMs.length === 0}
        />

        <View style={styles.rowBetween}>
          <Text style={ui.body}>Velocidad</Text>
          <View style={styles.chips}>
            <RoundButton label="−" hint="Más lento" small onPress={() => changeRate(-RATE_STEP)} />
            <Text style={styles.rate}>{Math.round(rate * 100)} %</Text>
            <RoundButton label="+" hint="Más rápido" small onPress={() => changeRate(RATE_STEP)} />
          </View>
        </View>
      </View>

      <StudioMixer
        master={player}
        rate={rate}
        study={study}
        onRequestStems={onRequestStems}
        requesting={requestingStems}
        requestError={requestStemsError}
      />

      {/* Corregir el "1" */}
      <View style={ui.card}>
        <Text style={ui.muted}>¿El 1 está corrido? Pon la canción en el 1 real y toca:</Text>
        <Button
          title="Marcar el 1 acá"
          onPress={() => onSetFirstBeat(Math.round(player.currentTime * 1000))}
          disabled={!status.isLoaded}
          loading={savingFirstBeat}
        />
        {study.firstBeatCorrected && (
          <Button title="Volver al automático" variant="ghost" onPress={() => onSetFirstBeat(null)} disabled={savingFirstBeat} />
        )}
      </View>
    </View>
  );
}

function RoundButton({ label, hint, onPress, small }: { label: string; hint: string; onPress: () => void; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={hint}
      hitSlop={6}
      style={({ pressed }) => [styles.round, small && styles.roundSmall, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.roundText, small && { fontSize: 18 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  counter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  caption: { color: colors.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  count: { color: colors.text, fontSize: 72, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 80 },
  countOf: { color: colors.textFaint, fontSize: 24, fontWeight: '600' },
  phrase: { color: colors.text, fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { color: colors.nectar, fontSize: 15, fontWeight: '700', marginTop: 2 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xl },
  play: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: colors.white, fontSize: 30 },
  round: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundSmall: { width: 38, height: 38, borderRadius: 19 },
  roundText: { color: colors.text, fontSize: 22 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  rate: { color: colors.text, fontSize: 16, fontWeight: '700', width: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
