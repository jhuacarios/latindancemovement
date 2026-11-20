import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { GifSearchResponse } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { colors, radius, space, ui } from '@/lib/theme';

const searchGifs = (q: string, offset: number) =>
  api<GifSearchResponse>(`/gifs?offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`);

/** ¿La API tiene GIFs activados? (sin clave de GIPHY, el botón no aparece). */
export function useGifsEnabled(): boolean {
  const q = useQuery({ queryKey: ['gifs', 'probe'], queryFn: () => searchGifs('', 0), staleTime: 30 * 60_000 });
  return Boolean(q.data?.enabled);
}

/** Buscador de GIFs (GIPHY) en un panel inferior; tocar uno lo envía. */
export function GifSheet({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (gifId: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(t);
  }, [text]);
  const list = useInfiniteQuery({
    queryKey: ['gifs', q],
    queryFn: ({ pageParam }) => searchGifs(q, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: visible,
    staleTime: 10 * 60_000,
  });
  const gifs = list.data?.pages.flatMap((p) => p.gifs) ?? [];
  const cell = Math.floor((width - space.md * 2 - 6) / 2);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { height: height * 0.6, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Buscar GIFs (ej: baile, salsa, aplausos)"
          placeholderTextColor={colors.textFaint}
          style={[ui.input, { marginHorizontal: space.md }]}
          returnKeyType="search"
          autoCorrect={false}
        />
        <FlatList
          data={gifs}
          keyExtractor={(g) => g.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 6 }}
          contentContainerStyle={{ gap: 6, padding: space.md }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: g }) => (
            <Pressable
              onPress={() => onPick(g.id)}
              style={({ pressed }) => [{ width: cell, height: 110, opacity: pressed ? 0.6 : 1 }]}
              accessibilityLabel={g.title || 'GIF'}
            >
              <Image source={g.previewUrl} style={styles.gif} contentFit="cover" />
            </Pressable>
          )}
          ListEmptyComponent={
            list.isLoading ? (
              <ActivityIndicator color={colors.clave} />
            ) : list.isError ? (
              <Text style={ui.error}>
                {list.error instanceof ApiError ? list.error.message : 'No se pudieron cargar los GIFs.'}
              </Text>
            ) : (
              <Text style={ui.muted}>No encontramos GIFs con eso.</Text>
            )
          }
        />
        <Text style={styles.attribution}>Powered by GIPHY</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.md,
  },
  gif: { flex: 1, borderRadius: radius.md, backgroundColor: colors.selva },
  attribution: { color: colors.textFaint, fontSize: 10, textAlign: 'right', paddingHorizontal: space.md },
});
