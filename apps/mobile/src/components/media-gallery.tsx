import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademyVideoDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { academiesApi, formatDuration } from '@/lib/academies';
import { MediaViewer } from '@/components/media-viewer';
import { MediaUploadButton } from '@/components/media-upload-button';
import { colors, ui } from '@/lib/theme';

/**
 * Fotos y videos en 3 columnas.
 * - `classId` = una clase: la API solo los entrega a los inscritos y a quienes
 *   administran la academia.
 * - `classId` = null: la galería de la academia (lo que no es de ninguna clase),
 *   que ve cualquiera con cuenta aunque no sea miembro.
 */
export function MediaGallery({
  academyId,
  classId,
  title = 'Fotos y videos',
  subtitle,
  emptyText,
  upload = 'none',
}: {
  academyId: string;
  classId: string | null;
  title?: string;
  subtitle?: string;
  emptyText: string;
  /** Quien administra: 'yes' = puede subir; 'no-plan' = sin Plan Director vigente (solo lectura). */
  upload?: 'none' | 'yes' | 'no-plan';
}) {
  const [open, setOpen] = useState<number | null>(null);
  // Ancho real de la grilla (medido): así caben 3 columnas en cualquier pantalla.
  const [gridWidth, setGridWidth] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ['academy-media', academyId, classId],
    queryFn: () => academiesApi.media(academyId, classId),
  });
  const GAP = 2;
  const cell = gridWidth > 0 ? Math.floor((gridWidth - GAP * 2) / 3) : 0;
  const qc = useQueryClient();
  // Galería abierta: lo que no es de ninguna clase + lo marcado con ⭐. Clase: lo suyo.
  const items = (data ?? []).filter((v) => (classId ? v.classId === classId : v.classId === null || v.featured));
  const manages = upload !== 'none';

  /** Pulsación larga (quien administra): mostrar o quitar de la galería abierta. */
  const feature = (v: AcademyVideoDto) => {
    if (!manages || !v.classId) return;
    const run = async () => {
      try {
        await academiesApi.setFeatured(academyId, v.id, !v.featured);
        void qc.invalidateQueries({ queryKey: ['academy-media', academyId] });
      } catch (e) {
        Alert.alert('No se pudo', e instanceof ApiError ? e.message : 'Revisa tu conexión.');
      }
    };
    Alert.alert(
      v.featured ? 'Quitar de la galería' : '⭐ Mostrar en la galería',
      v.featured
        ? 'Deja de verse en la galería abierta de la academia. Sigue en su clase.'
        : 'Sigue en su clase y además lo ve cualquiera en la galería de la academia.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: v.featured ? 'Quitar' : 'Mostrar', onPress: () => void run() },
      ],
    );
  };

  return (
    <View style={ui.card}>
      <Text style={ui.h2}>{title}</Text>
      {subtitle ? <Text style={ui.small}>{subtitle}</Text> : null}
      {upload === 'yes' && <MediaUploadButton academyId={academyId} classId={classId} />}
      {classId && manages && (
        <Text style={ui.small}>Mantén presionada una foto o video para mostrarlo también en la galería de la academia.</Text>
      )}
      {upload === 'no-plan' && (
        <Text style={ui.small}>Sin Plan Director vigente: la galería queda en solo lectura.</Text>
      )}
      {isLoading ? (
        <ActivityIndicator color={colors.clave} />
      ) : items.length === 0 ? (
        <Text style={ui.muted}>
          {emptyText}
        </Text>
      ) : (
        <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {cell > 0 &&
            items.map((v, i) => (
              <Pressable
                key={v.id}
                onPress={() => setOpen(i)}
                onLongPress={() => feature(v)}
                style={{ width: cell, height: cell }}
              >
                {v.thumbUrl ? (
                  <Image source={v.thumbUrl} style={styles.thumb} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 24 }}>{v.kind === 'PHOTO' ? '🖼️' : '🎬'}</Text>
                  </View>
                )}
                {v.kind !== 'PHOTO' && <Text style={styles.badge}>▶ {formatDuration(v.durationMs) ?? ''}</Text>}
                {classId && v.featured && <Text style={styles.star}>⭐</Text>}
              </Pressable>
            ))}
        </View>
      )}
      <MediaViewer
        items={items}
        urlFor={(vid) => academiesApi.mediaUrl(academyId, vid)}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.selva },
  star: { position: 'absolute', top: 4, right: 4, fontSize: 14 },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#000000aa',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
