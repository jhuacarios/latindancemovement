import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { placeLabel, regionName, type AcademySummaryDto } from '@baile-latino/types';
import { academiesApi, academyLogoUrl } from '@/lib/academies';
import { ApiError } from '@/lib/api';
import { Chips, StyleTag } from '@/components/chips';
import { useRegionFilter } from '@/lib/region';
import { colors, radius, space, ui } from '@/lib/theme';

function AcademyCard({ a }: { a: AcademySummaryDto }) {
  const logo = academyLogoUrl(a);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/academy/[id]', params: { id: a.id } })}
      style={({ pressed }) => [ui.card, styles.card, pressed && { opacity: 0.85 }]}
    >
      {logo ? (
        <Image source={logo} style={styles.logo} contentFit="cover" />
      ) : (
        <View style={[styles.logo, styles.logoEmpty]}>
          <Text style={{ fontSize: 28 }}>🎓</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={ui.h2} numberOfLines={1}>{a.name}</Text>
        <Text style={ui.muted} numberOfLines={1}>
          {[placeLabel(a.city, a.commune), regionName(a.region)].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.tags}>
          {a.styles.map((s) => <StyleTag key={s} style={s} />)}
          <Text style={ui.small}>
            {a.classCount} {a.classCount === 1 ? 'clase' : 'clases'} · {a.videoCount}{' '}
            {a.videoCount === 1 ? 'archivo' : 'archivos'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function AcademiesScreen() {
  const { region, setRegion, options } = useRegionFilter();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['academies', region],
    queryFn: () => academiesApi.list(region),
  });

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <FlatList
        data={data ?? []}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <AcademyCard a={item} />}
        contentContainerStyle={[ui.scroll, { paddingBottom: space.xxl }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.clave} />}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Text style={ui.h1}>Academias</Text>
            <Chips
              options={options}
              value={region}
              onChange={setRegion}
              allLabel="Todas las regiones"
            />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.clave} style={{ marginTop: space.xl }} />
          ) : isError ? (
            <Text style={ui.error}>{error instanceof ApiError ? error.message : 'No se pudo cargar.'}</Text>
          ) : (
            <Text style={ui.muted}>
              {region ? 'No hay academias en esta región todavía.' : 'Todavía no hay academias.'}
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.selva },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
