import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { placeLabel, type EventDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { eventsApi, flyerUrl, formatEventDate, styleFamilies } from '@/lib/events';
import { StyleMixBar } from '@/components/style-mix-bar';
import { Chips, StyleTag } from '@/components/chips';
import { useRegionFilter } from '@/lib/region';
import { colors, radius, space, ui } from '@/lib/theme';

function EventCard({ ev, past }: { ev: EventDto; past: boolean }) {
  const img = flyerUrl(ev);
  const cancelled = ev.status === 'CANCELLED';
  const where = [ev.venueName, placeLabel(ev.city, ev.commune)].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: ev.id } })}
      style={({ pressed }) => [
        ui.card,
        styles.card,
        (past || cancelled) && { opacity: 0.6 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {img ? (
        <Image source={img} style={styles.flyer} contentFit="cover" />
      ) : (
        <View style={[styles.flyer, styles.flyerEmpty]}>
          <Text style={{ fontSize: 28 }}>📅</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.titleRow}>
          <Text style={[ui.h2, { flex: 1 }]} numberOfLines={2}>
            {ev.title}
          </Text>
          {cancelled && <Text style={styles.cancelled}>CANCELADO</Text>}
        </View>
        <Text style={styles.date}>{formatEventDate(ev.startsAt)}</Text>
        {where ? (
          <Text style={ui.muted} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
        {ev.bachataPct != null ? (
          <StyleMixBar pct={ev.bachataPct} />
        ) : ev.styles.length > 0 ? (
          <View style={styles.tags}>
            {styleFamilies(ev.styles).map((s) => (
              <StyleTag key={s} style={s} />
            ))}
          </View>
        ) : null}
        {ev.priceInfo ? (
          <Text style={ui.small} numberOfLines={1}>
            {ev.priceInfo}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type Row = { ev: EventDto; past: boolean };

export default function EventsScreen() {
  const [includePast, setIncludePast] = useState(false);
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['events', { includePast }],
    queryFn: () => eventsApi.list(includePast),
  });
  // La API trae primero los próximos y después los ya realizados de cada región.
  const { region, setRegion, options } = useRegionFilter();
  const sections = (data?.sections ?? [])
    .filter((s) => s.events.length > 0 && (!region || s.region === region))
    .map((s) => ({
      title: s.name,
      upcoming: s.upcomingCount,
      data: s.events.map((ev, i): Row => ({ ev, past: i >= s.upcomingCount })),
    }));

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.ev.id}
        renderItem={({ item }) => <EventCard ev={item.ev} past={item.past} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.region}>
            {section.title}{' '}
            <Text style={{ color: section.upcoming > 0 ? colors.clave : colors.textFaint, fontWeight: '400' }}>
              ({section.upcoming} {section.upcoming === 1 ? 'próximo' : 'próximos'})
            </Text>
          </Text>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[ui.scroll, { paddingBottom: space.xxl }]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.clave} />
        }
        ListHeaderComponent={
          <View style={{ gap: space.sm }}>
            <Text style={ui.h1}>Eventos</Text>
            <Text style={ui.muted}>
              Sociales y eventos de baile por región, de norte a sur.
              {data ? ` ${data.upcomingTotal} próximo${data.upcomingTotal === 1 ? '' : 's'} en todo Chile.` : ''}
            </Text>
            <Chips options={options} value={region} onChange={setRegion} allLabel="Todas las regiones" />
            <View style={styles.toggle}>
              <Text style={ui.muted}>Mostrar ya realizados</Text>
              <Switch
                value={includePast}
                onValueChange={setIncludePast}
                trackColor={{ true: colors.brand, false: colors.line }}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.clave} style={{ marginTop: space.xl }} />
          ) : error ? (
            <Text style={ui.error}>
              {error instanceof ApiError ? error.message : 'No se pudieron cargar los eventos.'}
            </Text>
          ) : (
            <Text style={ui.muted}>
              {region
                ? `No hay eventos${includePast ? '' : ' próximos'} en esta región. Prueba con "Todas las regiones".`
                : includePast
                  ? 'Todavía no hay eventos publicados.'
                  : 'No hay eventos próximos por ahora.'}
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start' },
  flyer: { width: 72, height: 90, borderRadius: radius.md, backgroundColor: colors.selva },
  flyerEmpty: { alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  cancelled: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#ef444422',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  date: { color: colors.clave, fontSize: 14, fontWeight: '500' },
  tags: { flexDirection: 'row', gap: 6 },
  region: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: space.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
