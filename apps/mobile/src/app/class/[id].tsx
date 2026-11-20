import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { LEVEL_LABEL, WEEKDAYS, academiesApi, timeRange, uploadMode } from '@/lib/academies';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/button';
import { StyleTag } from '@/components/chips';
import { MediaGallery } from '@/components/media-gallery';
import { EnrollBox, enrolledLabel } from '@/components/class-enroll';
import { colors, space, ui, detailHeader } from '@/lib/theme';

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[ui.body, { flex: 1 }]}>{value}</Text>
    </View>
  );
}

/** Detalle de una clase: horario, inscripción, su chat y sus fotos y videos. */
export default function ClassScreen() {
  const { id, academyId } = useLocalSearchParams<{ id: string; academyId: string }>();
  const { user } = useAuth();
  // Misma consulta que la pantalla de la academia: llega ya cargada.
  const { data: a, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['academy', academyId],
    queryFn: () => academiesApi.get(academyId),
  });
  const c = a?.classes.find((x) => x.id === id);
  const superAdmin = user?.role === 'SUPER_ADMIN';
  const manages = Boolean(a && (a.myRole !== null || superAdmin));
  const canSee = manages || c?.myEnrollment === 'ACCEPTED';

  if (isLoading || error || !a || !c) {
    return (
      <View style={[ui.screen, styles.center]}>
        <Stack.Screen options={{ ...detailHeader, title: 'Clase' }} />
        {isLoading ? (
          <ActivityIndicator color={colors.clave} />
        ) : (
          <Text style={ui.error}>{error instanceof ApiError ? error.message : 'Clase no encontrada.'}</Text>
        )}
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ ...detailHeader, title: c.title }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={ui.screen}
        contentContainerStyle={[ui.scroll, { paddingBottom: space.xxl }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.clave} />
        }
      >
        <View style={{ gap: 4 }}>
          <Text style={ui.h1}>{c.title}</Text>
          <Text style={ui.muted}>{a.name}</Text>
        </View>

        <View style={ui.card}>
          <Row label="Cuándo" value={`${WEEKDAYS[c.weekday]} · ${timeRange(c.startTime, c.durationMin)}`} />
          <Row label="Nivel" value={LEVEL_LABEL[c.level]} />
          {c.style && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Estilo</Text>
              <StyleTag style={c.style} />
            </View>
          )}
          <Row label="Profesor" value={c.teacherName} />
          <Row label="Lugar" value={c.place} />
          <Row label="Valor" value={c.priceInfo} />
          <Row
            label="Alumnos"
            value={`${enrolledLabel(c)}${manages && c.pendingCount ? ` · ${c.pendingCount} solicitudes` : ''}`}
          />
          {c.description ? <Text style={ui.body}>{c.description}</Text> : null}
          {!c.active && <Text style={ui.small}>Esta clase está pausada.</Text>}
        </View>

        {/* El SUPER_ADMIN también puede inscribirse, aunque administre. */}
        {(!manages || superAdmin) && (
          <View style={ui.card}>
            <Text style={ui.h2}>Inscripción</Text>
            <EnrollBox academyId={a.id} c={c} />
          </View>
        )}

        {c.chatId && canSee && (
          <Button
            title="💬 Chat de la clase"
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.chatId! } })}
          />
        )}

        {canSee ? (
          <MediaGallery
            academyId={a.id}
            classId={c.id}
            upload={uploadMode(a, superAdmin)}
            emptyText="Todavía no hay fotos ni videos de esta clase."
          />
        ) : (
          <View style={ui.card}>
            <Text style={ui.h2}>Fotos y videos</Text>
            <Text style={ui.muted}>Solo los alumnos inscritos ven las fotos y videos de la clase.</Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowLabel: { width: 80, color: colors.textFaint, fontSize: 13 },
});
