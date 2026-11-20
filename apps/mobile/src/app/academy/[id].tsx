import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { placeLabel, regionName, type AcademyClassDto, type AcademyDto } from '@baile-latino/types';
import { LEVEL_LABEL, WEEKDAYS, WEEK_ORDER, academiesApi, academyLogoUrl, timeRange, uploadMode } from '@/lib/academies';
import { ApiError } from '@/lib/api';
import { StyleTag } from '@/components/chips';
import { EnrollPill, enrolledLabel } from '@/components/class-enroll';
import { MediaGallery } from '@/components/media-gallery';
import { colors, radius, space, ui, detailHeader } from '@/lib/theme';

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

/** Horario semanal informativo, agrupado por día (lunes primero). */
function Schedule({ classes, academyId, manages }: { classes: AcademyClassDto[]; academyId: string; manages: boolean }) {
  const active = classes.filter((c) => c.active);
  if (active.length === 0) return null;
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>Horario</Text>
      <Text style={ui.small}>Toca una clase para ver su detalle, su chat y sus fotos y videos.</Text>
      {WEEK_ORDER.filter((d) => active.some((c) => c.weekday === d)).map((d) => (
        <View key={d} style={{ gap: space.sm }}>
          <Text style={styles.day}>{WEEKDAYS[d]}</Text>
          {active
            .filter((c) => c.weekday === d)
            .sort((x, y) => x.startTime.localeCompare(y.startTime))
            .map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: '/class/[id]', params: { id: c.id, academyId } })}
                style={({ pressed }) => [styles.classRow, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <Text style={styles.time}>{timeRange(c.startTime, c.durationMin)}</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={ui.body}>{c.title}</Text>
                  <Text style={ui.small}>
                    {[LEVEL_LABEL[c.level], c.teacherName, c.place, c.priceInfo].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.row}>
                    <EnrollPill c={c} />
                    <Text style={ui.small}>
                      {enrolledLabel(c)}
                      {manages && c.pendingCount ? ` · ${c.pendingCount} solicitudes` : ''}
                    </Text>
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
        </View>
      ))}
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
      <Stack.Screen options={{ ...detailHeader, title: a?.name ?? 'Academia' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
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
            <MediaGallery
              academyId={a.id}
              classId={null}
              upload={uploadMode(a, user?.role === 'SUPER_ADMIN')}
              title="Galería"
              subtitle="El trabajo de la academia, abierto a todos."
              emptyText="La academia todavía no ha publicado fotos ni videos."
            />
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
  day: { color: colors.clave, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chevron: { color: colors.textFaint, fontSize: 24 },
  time: { color: colors.text, fontSize: 14, fontWeight: '600', width: 96, fontVariant: ['tabular-nums'] },
});
