import { useState } from 'react';
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
import {
  LEVEL_LABEL,
  MEMBER_ROLE_LABEL,
  WEEKDAYS,
  WEEK_ORDER,
  academiesApi,
  academyLogoUrl,
  academyMapsLink,
  timeRange,
  uploadMode,
} from '@/lib/academies';
import { Button } from '@/components/button';
import { UserAvatar } from '@/components/avatar-editor';
import { ApiError } from '@/lib/api';
import { StyleTag } from '@/components/chips';
import { EnrollPill, enrolledLabel } from '@/components/class-enroll';
import { MediaGallery } from '@/components/media-gallery';
import { colors, radius, space, ui, detailHeader } from '@/lib/theme';

/** Portada: mosaico con la galería abierta (fotos primero) y, encima, logo, nombre y datos. */
function Hero({ a }: { a: AcademyDto }) {
  const logo = academyLogoUrl(a);
  const { data } = useQuery({
    queryKey: ['academy-media', a.id, null],
    queryFn: () => academiesApi.media(a.id, null),
  });
  const covers = (data ?? [])
    .filter((v) => (v.classId === null || v.featured) && v.thumbUrl)
    .sort((x, y) => Number(y.kind === 'PHOTO') - Number(x.kind === 'PHOTO'))
    .slice(0, 3);
  const where = [placeLabel(a.city, a.commune), regionName(a.region)].filter(Boolean).join(' · ');
  return (
    <View style={styles.hero}>
      <View style={styles.mosaic}>
        {covers.length === 0 ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.brand, opacity: 0.35 }]} />
        ) : (
          <>
            <Image source={covers[0].thumbUrl!} style={{ flex: 2 }} contentFit="cover" />
            {covers.length > 1 && (
              <View style={{ flex: 1, gap: 2 }}>
                {covers.slice(1).map((v) => (
                  <Image key={v.id} source={v.thumbUrl!} style={{ flex: 1 }} contentFit="cover" />
                ))}
              </View>
            )}
          </>
        )}
        <View style={styles.shade} />
      </View>
      <View style={styles.heroBody}>
        {logo ? (
          <Image source={logo} style={styles.logo} contentFit="cover" />
        ) : (
          <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 34 }}>🎓</Text>
          </View>
        )}
        <Text style={ui.h1}>{a.name}</Text>
        {where ? <Text style={ui.muted}>{where}</Text> : null}
        <View style={styles.row}>
          {a.styles.map((s) => (
            <StyleTag key={s} style={s} />
          ))}
          {a.instagramHandle && (
            <Pressable
              onPress={() => void Linking.openURL(`https://instagram.com/${a.instagramHandle}`)}
              style={styles.igBtn}
            >
              <Text style={styles.igText}>@{a.instagramHandle}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function About({ a }: { a: AcademyDto }) {
  const [more, setMore] = useState(false);
  if (!a.description) return null;
  const long = a.description.length > 260;
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>Sobre la academia</Text>
      <Text style={[ui.body, { lineHeight: 22 }]} numberOfLines={long && !more ? 6 : undefined}>
        {a.description}
      </Text>
      {long && (
        <Text style={styles.link} onPress={() => setMore((m) => !m)}>
          {more ? 'Ver menos' : 'Ver más'}
        </Text>
      )}
    </View>
  );
}

function WhereAndTeam({ a }: { a: AcademyDto }) {
  const maps = academyMapsLink(a);
  return (
    <>
      {(a.address || a.city) && (
        <View style={ui.card}>
          <Text style={ui.h2}>Dónde</Text>
          {a.address ? <Text style={ui.body}>{a.address}</Text> : null}
          <Text style={ui.muted}>{[placeLabel(a.city, a.commune), regionName(a.region)].filter(Boolean).join(' · ')}</Text>
          {maps && <Button title="📍 Cómo llegar" variant="ghost" onPress={() => void Linking.openURL(maps)} />}
        </View>
      )}
      {a.team.length > 0 && (
        <View style={ui.card}>
          <Text style={ui.h2}>Equipo</Text>
          {a.team.map((m) => (
            <View key={m.userId} style={styles.member}>
              <UserAvatar user={{ id: m.userId, avatarAt: m.avatarAt, name: m.name, displayName: null }} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={ui.body}>{m.name}</Text>
                <Text style={ui.small}>{MEMBER_ROLE_LABEL[m.role]}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
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
            <Hero a={a} />
            <About a={a} />
            <MediaGallery
              academyId={a.id}
              classId={null}
              columns={2}
              upload={uploadMode(a, user?.role === 'SUPER_ADMIN')}
              title="Galería"
              emptyText="La academia todavía no ha publicado fotos ni videos."
            />
            <Schedule classes={a.classes} academyId={a.id} manages={a.myRole !== null || user?.role === 'SUPER_ADMIN'} />
            <WhereAndTeam a={a} />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  mosaic: { height: 190, flexDirection: 'row', gap: 2, backgroundColor: colors.selva },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0d1f1a55' },
  heroBody: { marginTop: -44, padding: space.lg, paddingTop: 0, gap: 6 },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.selva,
    borderWidth: 3,
    borderColor: colors.surface,
    marginBottom: 4,
  },
  igBtn: { backgroundColor: '#d6297a', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  igText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  member: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  link: { color: colors.clave, fontSize: 13, fontWeight: '600' },
  day: { color: colors.clave, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chevron: { color: colors.textFaint, fontSize: 24 },
  time: { color: colors.text, fontSize: 14, fontWeight: '600', width: 96, fontVariant: ['tabular-nums'] },
});
