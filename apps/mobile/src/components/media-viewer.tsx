import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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

type Props = {
  items: AcademyVideoDto[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
};

/**
 * Contenido del visor. Va dentro de su propio SafeAreaProvider: en un <Modal> de
 * iOS no llegan los márgenes del notch, y sin ellos la barra quedaba bajo la hora.
 * Nada se superpone al video: arriba la barra (título + ✕), al medio el archivo y
 * abajo anterior/siguiente; así los controles nativos del video quedan tocables.
 */
function ViewerBody({ items, index, onIndex, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const item = index !== null ? items[index] : null;
  const { data, isLoading, error } = useQuery({
    queryKey: ['academy-media-url', item?.id],
    queryFn: () => academiesApi.mediaUrl(item!.academyId, item!.id),
    enabled: Boolean(item),
    staleTime: 50 * 60_000, // la URL dura 1 h
  });

  return (
    <View style={styles.backdrop}>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{item?.title}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.btn} accessibilityLabel="Cerrar" hitSlop={12}>
          <Text style={styles.btnText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.stage}>
        {isLoading && <ActivityIndicator color={colors.white} />}
        {error && (
          <Text style={[ui.error, { textAlign: 'center', paddingHorizontal: space.xl }]}>
            {error instanceof ApiError ? error.message : 'No se pudo abrir el archivo.'}
          </Text>
        )}
        {data?.url && item?.kind === 'PHOTO' && (
          <Image source={data.url} style={StyleSheet.absoluteFill} contentFit="contain" />
        )}
        {data?.url && item?.kind !== 'PHOTO' && <VideoPlayerView key={data.url} url={data.url} />}
      </View>

      {index !== null && items.length > 1 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.sm }]}>
          <Pressable
            onPress={() => onIndex((index - 1 + items.length) % items.length)}
            style={styles.btn}
            accessibilityLabel="Anterior"
            hitSlop={12}
          >
            <Text style={styles.btnText}>‹</Text>
          </Pressable>
          <Text style={styles.counter}>{index + 1} / {items.length}</Text>
          <Pressable
            onPress={() => onIndex((index + 1) % items.length)}
            style={styles.btn}
            accessibilityLabel="Siguiente"
            hitSlop={12}
          >
            <Text style={styles.btnText}>›</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Visor a pantalla completa de la galería: fotos y videos, con anterior/siguiente. */
export function MediaViewer(props: Props) {
  return (
    <Modal
      visible={props.index !== null}
      animationType="fade"
      onRequestClose={props.onClose}
      supportedOrientations={['portrait', 'landscape']}
      statusBarTranslucent
    >
      <SafeAreaProvider>
        <ViewerBody {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  title: { color: colors.white, fontSize: 15, fontWeight: '600' },
  counter: { color: '#ffffffaa', fontSize: 12 },
  btn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: '#ffffff22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.white, fontSize: 24, lineHeight: 28 },
});
