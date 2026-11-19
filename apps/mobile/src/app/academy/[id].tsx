import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/button';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { placeLabel, regionName, type AcademyClassDto, type AcademyDto } from '@baile-latino/types';
import {
  LEVEL_LABEL,
  WEEKDAYS,
  WEEK_ORDER,
  academiesApi,
  academyLogoUrl,
  formatDuration,
  timeRange,
} from '@/lib/academies';
import { ApiError } from '@/lib/api';
import { Chips, StyleTag } from '@/components/chips';
import { MediaViewer } from '@/components/media-viewer';
import { colors, radius, space, ui } from '@/lib/theme';

function Header({ a }: { a: AcademyDto }) {
  const logo = academyLogoUrl(a);
  return (
    <View style={[ui.card, { flexDirection: 'row', alignItems: 'center' }]}>
      {logo ? (
        <Image source={logo} style={styles.logo} contentFit="cover" />
      ) : (
        <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 34 }}>🎓</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={ui.h2}>{a.name}</Text>
        <Text style={ui.muted}>
          {[a.address, placeLabel(a.city, a.commune), regionName(a.region)].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.row}>
          {a.styles.map((s) => <StyleTag key={s} style={s} />)}
          {a.instagramHandle && (
            <Text
              style={styles.link}
              onPress={() => void Linking.openURL(`https://instagram.com/${a.instagramHandle}`)}
            >
              @{a.instagramHandle}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

/** Pedir inscripción / estado (pendiente, inscrito, rechazado). Lo decide el director. */
function EnrollRow({ academyId, c, manages }: { academyId: string; c: AcademyClassDto; manages: boolean }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const full = c.capacity !== null && c.enrolledCount >= c.capacity;
  const count = c.capacity ? `${c.enrolledCount}/${c.capacity} inscritos` : `${c.enrolledCount} inscritos`;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setAsking(false);
      setMessage('');
      await qc.invalidateQueries({ queryKey: ['academy', academyId] });
      await qc.invalidateQueries({ queryKey: ['academy-media', academyId] });
      await qc.invalidateQueries({ queryKey: ['my-enrollments'] });
    } catch (e) {
      Alert.alert('No se pudo', e instanceof ApiError ? e.message : 'Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  if (manages) return <Text style={ui.small}>{count}{c.pendingCount ? ` · ${c.pendingCount} solicitudes` : ''}</Text>;

  return (
    <View style={{ gap: 6 }}>
      <Text style={ui.small}>{count}{full ? ' · clase llena' : ''}</Text>
      {c.myEnrollment === 'ACCEPTED' ? (
        <View style={styles.row}>
          <Text style={[styles.pill, { color: colors.clave, backgroundColor: '#1a7a4e33' }]}>✓ Inscrito</Text>
          <Text
            style={styles.linkMuted}
            onPress={() =>
              Alert.alert('Dejar la clase', `Saldrás de "${c.title}" y de su chat.`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Dejar', style: 'destructive', onPress: () => void run(() => academiesApi.unenroll(academyId, c.id)) },
              ])
            }
          >
            Dejar la clase
          </Text>
        </View>
      ) : c.myEnrollment === 'PENDING' ? (
        <View style={styles.row}>
          <Text style={[styles.pill, { color: colors.bachata, backgroundColor: '#f59e0b22' }]}>
            ⏳ Solicitud enviada{full ? ' (en espera)' : ''}
          </Text>
          <Text style={styles.linkMuted} onPress={() => void run(() => academiesApi.unenroll(academyId, c.id))}>
            Cancelar
          </Text>
        </View>
      ) : asking ? (
        <View style={{ gap: space.sm }}>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Mensaje para el director (opcional)"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={500}
            style={[ui.input, { minHeight: 64, textAlignVertical: 'top' }]}
          />
          <View style={styles.row}>
            <Button title="Enviar solicitud" onPress={() => void run(() => academiesApi.enroll(academyId, c.id, message))} loading={busy} style={{ flex: 1 }} />
            <Button title="Cancelar" variant="ghost" onPress={() => setAsking(false)} />
          </View>
        </View>
      ) : (
        <Button
          title={c.myEnrollment === 'REJECTED' ? 'Volver a pedir inscripción' : 'Solicitar inscripción'}
          variant="ghost"
          onPress={() => setAsking(true)}
        />
      )}
    </View>
  );
}

/** Horario semanal informativo, agrupado por día (lunes primero). */
function Schedule({ classes, academyId, manages }: { classes: AcademyClassDto[]; academyId: string; manages: boolean }) {
  const active = classes.filter((c) => c.active);
  if (active.length === 0) return null;
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>Horario</Text>
      {WEEK_ORDER.filter((d) => active.some((c) => c.weekday === d)).map((d) => (
        <View key={d} style={{ gap: space.sm }}>
          <Text style={styles.day}>{WEEKDAYS[d]}</Text>
          {active
            .filter((c) => c.weekday === d)
            .sort((x, y) => x.startTime.localeCompare(y.startTime))
            .map((c) => (
              <View key={c.id} style={styles.classRow}>
                <Text style={styles.time}>{timeRange(c.startTime, c.durationMin)}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={ui.body}>{c.title}</Text>
                  <Text style={ui.small}>
                    {[LEVEL_LABEL[c.level], c.teacherName, c.place, c.priceInfo].filter(Boolean).join(' · ')}
                  </Text>
                  <EnrollRow academyId={academyId} c={c} manages={manages} />
                </View>
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}

function Gallery({ a }: { a: AcademyDto }) {
  const [classId, setClassId] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  // Ancho real de la grilla (medido): así caben 3 columnas en cualquier pantalla.
  const [gridWidth, setGridWidth] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ['academy-media', a.id, classId],
    queryFn: () => academiesApi.media(a.id, classId),
  });
  const GAP = 2;
  const cell = gridWidth > 0 ? Math.floor((gridWidth - GAP * 2) / 3) : 0;
  const classOptions = useMemo(
    () => a.classes.map((c) => ({ value: c.id, label: c.title })),
    [a.classes],
  );
  const items = data ?? [];

  return (
    <View style={ui.card}>
      <Text style={ui.h2}>Fotos y videos</Text>
      {classOptions.length > 0 && (
        <Chips options={classOptions} value={classId} onChange={setClassId} allLabel="Todas las clases" />
      )}
      {isLoading ? (
        <ActivityIndicator color={colors.clave} />
      ) : items.length === 0 ? (
        <Text style={ui.muted}>Todavía no hay fotos ni videos{classId ? ' de esta clase' : ''}.</Text>
      ) : (
        <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {cell > 0 && items.map((v, i) => (
            <Pressable key={v.id} onPress={() => setOpen(i)} style={{ width: cell, height: cell }}>
              {v.thumbUrl ? (
                <Image source={v.thumbUrl} style={styles.thumb} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 24 }}>{v.kind === 'PHOTO' ? '🖼️' : '🎬'}</Text>
                </View>
              )}
              {v.kind !== 'PHOTO' && (
                <Text style={styles.badge}>▶ {formatDuration(v.durationMs) ?? ''}</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
      <MediaViewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </View>
  );
}

export default function AcademyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: a, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['academy', id],
    queryFn: () => academiesApi.get(id),
  });

  return (
    <>
      <Stack.Screen options={{ title: a?.name ?? 'Academia' }} />
      <ScrollView
        style={ui.screen}
        contentContainerStyle={[ui.scroll, { paddingBottom: space.xxl }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.clave} />}
      >
        {isLoading && <ActivityIndicator color={colors.clave} />}
        {error && <Text style={ui.error}>{error instanceof ApiError ? error.message : 'No se pudo cargar.'}</Text>}
        {a && (
          <>
            <Header a={a} />
            {a.description ? (
              <View style={ui.card}>
                <Text style={ui.body}>{a.description}</Text>
              </View>
            ) : null}
            <Schedule classes={a.classes} academyId={a.id} manages={a.myRole !== null || user?.role === 'SUPER_ADMIN'} />
            <Gallery a={a} />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  logo: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.selva },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  link: { color: colors.clave, fontSize: 13, fontWeight: '600' },
  linkMuted: { color: colors.textMuted, fontSize: 13 },
  pill: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  day: { color: colors.clave, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  classRow: { flexDirection: 'row', gap: space.md },
  time: { color: colors.text, fontSize: 14, fontWeight: '600', width: 96, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.selva },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#000000aa',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
