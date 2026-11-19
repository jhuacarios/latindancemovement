import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { pctFromStyles, placeLabel, type CommunityPlaceDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { placePhotoUrl, placesApi } from '@/lib/places';
import { StyleMixBar } from '@/components/style-mix-bar';
import { colors, radius, space, ui } from '@/lib/theme';

function PlaceCard({ p }: { p: CommunityPlaceDto }) {
  const img = placePhotoUrl(p);
  const pct = p.bachataPct ?? (p.styles.length ? pctFromStyles(p.styles) : null);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })}
      style={({ pressed }) => [ui.card, styles.card, pressed && { opacity: 0.85 }]}
    >
      {img ? (
        <Image source={img} style={styles.photo} contentFit="cover" />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Text style={{ fontSize: 30 }}>🌴</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={ui.h2} numberOfLines={1}>{p.name}</Text>
        <Text style={ui.muted} numberOfLines={1}>
          {[p.place, placeLabel(p.city, p.commune)].filter(Boolean).join(' · ')}
        </Text>
        {p.schedule ? <Text style={styles.schedule} numberOfLines={1}>{p.schedule}</Text> : null}
        {pct !== null && <StyleMixBar pct={pct} />}
      </View>
    </Pressable>
  );
}

export default function SocialsScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['places', 'outdoor'],
    queryFn: placesApi.outdoor,
  });
  const sections = (data?.sections ?? [])
    .filter((s) => s.count > 0)
    .map((s) => ({ title: s.name, count: s.count, data: s.places }));

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PlaceCard p={item} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.region}>
            {section.title} <Text style={{ color: colors.clave }}>({section.count})</Text>
          </Text>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[ui.scroll, { paddingBottom: space.xxl }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.clave} />}
        ListHeaderComponent={
          <View style={{ gap: 4 }}>
            <Text style={ui.h1}>Sociales</Text>
            <Text style={ui.muted}>Juntas al aire libre en playas, parques y plazas.</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.clave} style={{ marginTop: space.xl }} />
          ) : error ? (
            <Text style={ui.error}>{error instanceof ApiError ? error.message : 'No se pudo cargar.'}</Text>
          ) : (
            <Text style={ui.muted}>Todavía no hay sociales publicados.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center' },
  photo: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.selva },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  schedule: { color: colors.clave, fontSize: 13 },
  region: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: space.sm },
});
