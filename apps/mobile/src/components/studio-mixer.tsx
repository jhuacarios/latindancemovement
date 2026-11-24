import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SeparationMode, SongStudy, StemKey, StemUrls } from '@baile-latino/types';
import { Button } from '@/components/button';
import { studioApi } from '@/lib/studio';
import { colors, radius, space, ui } from '@/lib/theme';

/**
 * Mezclador en el teléfono: cada pista separada suena en su propio reproductor y
 * sigue al reproductor principal (el reloj, que queda en silencio): mismo play,
 * pausa, velocidad y posición, corrigiendo si una pista se desfasa.
 *
 * A diferencia de la web no hay filtros por banda: la percusión es un solo canal
 * (y la campana aparte en la separación completa).
 */

interface Channel {
  key: string;
  label: string;
  stems: StemKey[];
}

const LAYOUTS: Record<SeparationMode, Record<string, Channel[]>> = {
  DEEP: {
    BACHATA: [
      { key: 'vocals', label: 'Voz principal', stems: ['vocals'] },
      { key: 'coros', label: 'Coros', stems: ['coros'] },
      { key: 'requinto', label: 'Requinto', stems: ['requinto'] },
      { key: 'segunda', label: 'Segunda', stems: ['segunda'] },
      { key: 'bass', label: 'Bajo', stems: ['bass'] },
      { key: 'drums', label: 'Percusión', stems: ['drums'] },
      { key: 'campana', label: 'Campana', stems: ['campana'] },
      { key: 'keys', label: 'Teclados', stems: ['keys'] },
      { key: 'other', label: 'Otros', stems: ['other'] },
    ],
    SALSA: [
      { key: 'vocals', label: 'Sonero', stems: ['vocals'] },
      { key: 'coros', label: 'Coros', stems: ['coros'] },
      { key: 'keys', label: 'Piano', stems: ['keys'] },
      { key: 'other', label: 'Metales', stems: ['other'] },
      { key: 'guitar', label: 'Guitarra / tres', stems: ['requinto', 'segunda'] },
      { key: 'bass', label: 'Bajo', stems: ['bass'] },
      { key: 'drums', label: 'Percusión', stems: ['drums'] },
      { key: 'campana', label: 'Campana', stems: ['campana'] },
    ],
  },
  BASIC: {
    BACHATA: [
      { key: 'vocals', label: 'Voces', stems: ['vocals'] },
      { key: 'guitar', label: 'Guitarras', stems: ['guitar'] },
      { key: 'bass', label: 'Bajo', stems: ['bass'] },
      { key: 'drums', label: 'Percusión', stems: ['drums'] },
      { key: 'keys', label: 'Teclados', stems: ['keys'] },
      { key: 'other', label: 'Otros', stems: ['other'] },
    ],
    SALSA: [
      { key: 'vocals', label: 'Voces', stems: ['vocals'] },
      { key: 'keys', label: 'Piano', stems: ['keys'] },
      { key: 'other', label: 'Metales', stems: ['other'] },
      { key: 'guitar', label: 'Guitarra / tres', stems: ['guitar'] },
      { key: 'bass', label: 'Bajo', stems: ['bass'] },
      { key: 'drums', label: 'Percusión', stems: ['drums'] },
    ],
  },
};
const channelsFor = (style: string, mode: SeparationMode) => LAYOUTS[mode][style] ?? LAYOUTS[mode].BACHATA;

const MODE_INFO: Record<SeparationMode, { label: string; hint: string }> = {
  BASIC: {
    label: '⚡ Separación rápida',
    hint: 'Instrumentos principales: voces, guitarras, bajo, percusión, teclados y otros. ~3 veces más rápida.',
  },
  DEEP: {
    label: '🔬 Separación completa',
    hint: 'Además coros aparte de la voz principal, requinto y segunda, y campana. Hasta ~10 minutos.',
  },
};

const LEVELS = [0, 0.25, 0.5, 0.75, 1];
/** Desfase tolerado (s) entre una pista y el reloj antes de corregirla. */
const MAX_DRIFT_SEC = 0.12;
const SYNC_EVERY_MS = 250;
/** Tras corregir una pista, se le da este margen antes de volver a medirla. */
const RESEEK_COOLDOWN_MS = 1200;

/** Reproductores de las pistas, sincronizados con `master`. */
function useStemPlayers(master: AudioPlayer, urls: StemUrls | undefined, active: boolean) {
  const playersRef = useRef<Partial<Record<StemKey, AudioPlayer>>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active || !urls) return;
    const players: Partial<Record<StemKey, AudioPlayer>> = {};
    for (const [key, uri] of Object.entries(urls) as [StemKey, string | undefined][]) {
      if (uri) players[key] = createAudioPlayer({ uri }, { updateInterval: 500 });
    }
    playersRef.current = players;
    const list = Object.values(players) as AudioPlayer[];
    const cooldown = new Map<AudioPlayer, number>();
    let isReady = false;
    setReady(false);
    master.muted = true;

    const timer = setInterval(() => {
      if (!isReady) {
        if (!list.every((p) => p.isLoaded)) return;
        isReady = true;
        setReady(true);
        for (const p of list) void p.seekTo(master.currentTime);
      }
      const now = Date.now();
      for (const p of list) {
        if (p.playbackRate !== master.playbackRate) p.setPlaybackRate(master.playbackRate, 'high');
        if (master.playing && !p.playing) p.play();
        if (!master.playing && p.playing) p.pause();
        if ((cooldown.get(p) ?? 0) > now) continue;
        if (Math.abs(p.currentTime - master.currentTime) > MAX_DRIFT_SEC) {
          void p.seekTo(master.currentTime);
          cooldown.set(p, now + RESEEK_COOLDOWN_MS);
        }
      }
    }, SYNC_EVERY_MS);

    return () => {
      clearInterval(timer);
      for (const p of list) {
        p.pause();
        p.remove();
      }
      playersRef.current = {};
      master.muted = false;
      setReady(false);
    };
  }, [active, urls, master]);

  return { playersRef, ready };
}

export function StudioMixer({
  master,
  study,
  onRequestStems,
  requesting,
  requestError,
}: {
  master: AudioPlayer;
  study: SongStudy;
  onRequestStems: (mode: SeparationMode) => void;
  requesting: boolean;
  requestError: string | null;
}) {
  const [enabled, setEnabled] = useState(false);
  const mode: SeparationMode = study.stemsMode ?? 'DEEP';
  const channels = channelsFor(study.style, mode);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [solo, setSolo] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const status = study.stemsStatus;

  useEffect(() => {
    setLevels({});
    setMuted(new Set());
    setSolo(new Set());
  }, [mode]);

  // Las URLs firmadas duran 1 h: se piden al activar y se reutilizan 50 min.
  const urls = useQuery({
    queryKey: ['studio', 'stem-urls', study.id, mode],
    queryFn: () => studioApi.stemUrls(study.id),
    enabled: enabled && status === 'DONE',
    staleTime: 50 * 60 * 1000,
  });
  useEffect(() => {
    if (!urls.isError) return;
    setEnabled(false);
    void qc.invalidateQueries({ queryKey: ['studio', 'audio-file', study.id] });
  }, [urls.isError, qc, study.id]);

  const { playersRef, ready } = useStemPlayers(master, urls.data, enabled && status === 'DONE');

  // Volumen de cada pista: nivel × silencio × solo.
  useEffect(() => {
    if (!ready) return;
    for (const c of channels) {
      const audible = !muted.has(c.key) && (solo.size === 0 || solo.has(c.key));
      const v = audible ? (levels[c.key] ?? 1) : 0;
      for (const s of c.stems) {
        const p = playersRef.current[s];
        if (p) p.volume = v;
      }
    }
  }, [ready, channels, levels, muted, solo, playersRef]);

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

  return (
    <View style={ui.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={ui.h2}>🎛️ Mezclador</Text>
          <Text style={ui.small}>Sube o baja cada instrumento. Las pistas son privadas: solo tú las escuchas.</Text>
        </View>
      </View>

      {status === 'DONE' && (
        <Button
          title={enabled ? 'Volver a la canción original' : 'Usar mezclador'}
          variant={enabled ? 'ghost' : 'primary'}
          onPress={() => setEnabled((v) => !v)}
        />
      )}

      {status === null && (
        <View style={{ gap: space.sm }}>
          {(['BASIC', 'DEEP'] as const).map((m) => (
            <View key={m} style={styles.option}>
              <Button
                title={MODE_INFO[m].label}
                variant={m === 'DEEP' ? 'ghost' : 'primary'}
                onPress={() => onRequestStems(m)}
                disabled={requesting}
              />
              <Text style={ui.small}>{MODE_INFO[m].hint}</Text>
            </View>
          ))}
          <Text style={ui.small}>Sigue en segundo plano: puedes salir y volver después. Una canción a la vez.</Text>
        </View>
      )}
      {(status === 'PENDING' || status === 'PROCESSING') && (
        <View style={styles.rowCenter}>
          <ActivityIndicator color={colors.clave} />
          <Text style={[ui.muted, { flex: 1 }]}>
            {mode === 'BASIC'
              ? 'Separando los instrumentos principales… (un par de minutos)'
              : 'Separando todos los instrumentos… (hasta ~10 minutos)'}
            . Puedes salir: sigue en segundo plano.
          </Text>
        </View>
      )}
      {status === 'ERROR' && (
        <View style={{ gap: space.sm }}>
          <Text style={ui.error}>No se pudieron separar las pistas.</Text>
          <Button title="Reintentar" variant="ghost" onPress={() => onRequestStems(mode)} disabled={requesting} />
        </View>
      )}
      {status === 'DONE' && mode === 'BASIC' && !enabled && (
        <View style={{ gap: space.xs }}>
          <Text style={ui.small}>Pistas de la separación rápida. ¿Quieres coros, requinto, segunda y campana aparte?</Text>
          <Button title={MODE_INFO.DEEP.label} variant="ghost" onPress={() => onRequestStems('DEEP')} disabled={requesting} />
        </View>
      )}
      {requestError ? <Text style={[ui.small, { color: colors.bachata }]}>{requestError}</Text> : null}

      {enabled && !ready && (
        <View style={styles.rowCenter}>
          <ActivityIndicator color={colors.clave} />
          <Text style={ui.muted}>Cargando pistas…</Text>
        </View>
      )}

      {enabled && ready && (
        <View style={{ gap: space.sm }}>
          {channels.map((c) => {
            const level = levels[c.key] ?? 1;
            return (
              <View key={c.key} style={styles.channel}>
                <Text style={styles.channelLabel} numberOfLines={1}>
                  {c.label}
                </Text>
                <View style={styles.levels}>
                  {LEVELS.map((l) => (
                    <Pressable
                      key={l}
                      onPress={() => setLevels((s) => ({ ...s, [c.key]: l }))}
                      style={[styles.level, { height: 8 + l * 16 }, l <= level && level > 0 && styles.levelOn]}
                      hitSlop={{ top: 12, bottom: 12 }}
                      accessibilityLabel={`${c.label} al ${Math.round(l * 100)}%`}
                    />
                  ))}
                </View>
                <Pressable
                  onPress={() => toggleIn(setMuted, c.key)}
                  style={[styles.toggle, muted.has(c.key) && { backgroundColor: '#ef4444bb' }]}
                  accessibilityLabel={`Silenciar ${c.label}`}
                  accessibilityState={{ selected: muted.has(c.key) }}
                >
                  <Text style={styles.toggleText}>M</Text>
                </Pressable>
                <Pressable
                  onPress={() => toggleIn(setSolo, c.key)}
                  style={[styles.toggle, solo.has(c.key) && { backgroundColor: colors.clave }]}
                  accessibilityLabel={`Escuchar solo ${c.label}`}
                  accessibilityState={{ selected: solo.has(c.key) }}
                >
                  <Text style={[styles.toggleText, solo.has(c.key) && { color: colors.selva }]}>S</Text>
                </Pressable>
              </View>
            );
          })}
          <Text style={ui.small}>Toca las barras para el volumen. M = silenciar, S = escuchar solo ese.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  option: { gap: space.xs, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  channel: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  channelLabel: { width: 96, color: colors.text, fontSize: 14 },
  levels: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 26 },
  level: { flex: 1, borderRadius: 3, backgroundColor: colors.line },
  levelOn: { backgroundColor: colors.clave },
  toggle: {
    width: 32,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
