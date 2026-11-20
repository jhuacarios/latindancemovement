import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { stickersApi, stickerUrl } from '@/lib/stickers';
import { colors, radius, space, ui } from '@/lib/theme';

/** Panel inferior con los packs de stickers que puedo usar; tocar uno lo envía. */
export function StickerSheet({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (stickerId: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [packIdx, setPackIdx] = useState(0);
  const q = useQuery({
    queryKey: ['stickers', 'available'],
    queryFn: stickersApi.available,
    enabled: visible,
    staleTime: 5 * 60_000,
  });
  const packs = q.data ?? [];
  const pack = packs[Math.min(packIdx, Math.max(0, packs.length - 1))];
  const cell = Math.floor((width - space.md * 2 - 3 * 6) / 4);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        {q.isLoading ? (
          <ActivityIndicator color={colors.clave} style={{ margin: space.xl }} />
        ) : packs.length === 0 ? (
          <Text style={[ui.muted, { padding: space.lg }]}>
            Todavía no hay stickers. Las academias y los sociales pueden crear los suyos desde la web.
          </Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {packs.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPackIdx(i)}
                  style={[styles.tab, p.id === pack?.id && styles.tabOn]}
                >
                  <Text style={[styles.tabText, p.id === pack?.id && { color: colors.clave }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={styles.grid}>
              {pack?.stickers.map((id) => (
                <Pressable
                  key={id}
                  onPress={() => onPick(id)}
                  style={({ pressed }) => [{ width: cell, height: cell, padding: 4 }, pressed && { opacity: 0.6 }]}
                  accessibilityLabel="Enviar sticker"
                >
                  <Image source={stickerUrl(id)} style={{ flex: 1 }} contentFit="contain" />
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}
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
    paddingTop: space.sm,
  },
  tabs: { gap: 6, paddingHorizontal: space.md, paddingBottom: space.sm },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line },
  tabOn: { borderColor: colors.clave, backgroundColor: '#1a7a4e33' },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600', maxWidth: 160 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: space.md },
});
