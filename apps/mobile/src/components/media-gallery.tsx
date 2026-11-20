import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
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
  // La lista sin filtro trae todo lo visible; la de una clase, también los generales.
  const items = (data ?? []).filter((v) => v.classId === classId);

  return (
    <View style={ui.card}>
      <Text style={ui.h2}>{title}</Text>
      {subtitle ? <Text style={ui.small}>{subtitle}</Text> : null}
      {upload === 'yes' && <MediaUploadButton academyId={academyId} classId={classId} />}
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
              <Pressable key={v.id} onPress={() => setOpen(i)} style={{ width: cell, height: cell }}>
                {v.thumbUrl ? (
                  <Image source={v.thumbUrl} style={styles.thumb} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 24 }}>{v.kind === 'PHOTO' ? '🖼️' : '🎬'}</Text>
                  </View>
                )}
                {v.kind !== 'PHOTO' && <Text style={styles.badge}>▶ {formatDuration(v.durationMs) ?? ''}</Text>}
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
