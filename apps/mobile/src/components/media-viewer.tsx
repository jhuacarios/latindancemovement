import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { AcademyVideoDto } from '@baile-latino/types';
import { academiesApi } from '@/lib/academies';
import { ApiError } from '@/lib/api';
import { colors, radius, space, ui } from '@/lib/theme';

/** Un video: se crea el reproductor con la URL firmada (un componente por URL). */
function VideoPlayerView({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

/**
 * Visor a pantalla completa de la galería: fotos y videos, con anterior/siguiente.
 * La URL es firmada y dura 1 h: se pide al abrir cada archivo.
 */
export function MediaViewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: AcademyVideoDto[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = index !== null ? items[index] : null;
  const { data, isLoading, error } = useQuery({
    queryKey: ['academy-media-url', item?.id],
    queryFn: () => academiesApi.mediaUrl(item!.academyId, item!.id),
    enabled: Boolean(item),
    staleTime: 50 * 60_000, // la URL dura 1 h
  });

  return (
    <Modal visible={Boolean(item)} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.backdrop}>
        <View style={StyleSheet.absoluteFill}>
          {isLoading && <ActivityIndicator color={colors.white} style={styles.center} />}
          {error && (
            <Text style={[ui.error, styles.center]}>
              {error instanceof ApiError ? error.message : 'No se pudo abrir el archivo.'}
            </Text>
          )}
          {data?.url && item?.kind === 'PHOTO' && (
            <Image source={data.url} style={StyleSheet.absoluteFill} contentFit="contain" />
          )}
          {data?.url && item?.kind !== 'PHOTO' && <VideoPlayerView key={data.url} url={data.url} />}
        </View>

        <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{item?.title}</Text>
            {index !== null && (
              <Text style={styles.counter}>{index + 1} / {items.length}</Text>
            )}
          </View>
          <Pressable onPress={onClose} style={styles.btn} accessibilityLabel="Cerrar" hitSlop={10}>
            <Text style={styles.btnText}>✕</Text>
          </Pressable>
        </SafeAreaView>

        {index !== null && items.length > 1 && (
          <SafeAreaView style={styles.bottomBar} edges={['bottom']} pointerEvents="box-none">
            <Pressable
              onPress={() => onIndex((index - 1 + items.length) % items.length)}
              style={styles.btn}
              accessibilityLabel="Anterior"
              hitSlop={10}
            >
              <Text style={styles.btnText}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => onIndex((index + 1) % items.length)}
              style={styles.btn}
              accessibilityLabel="Siguiente"
              hitSlop={10}
            >
              <Text style={styles.btnText}>›</Text>
            </Pressable>
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  center: { position: 'absolute', top: '50%', alignSelf: 'center', textAlign: 'center', paddingHorizontal: space.xl },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    backgroundColor: '#00000088',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  title: { color: colors.white, fontSize: 15, fontWeight: '600' },
  counter: { color: '#ffffffaa', fontSize: 12 },
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.white, fontSize: 24, lineHeight: 28 },
});
