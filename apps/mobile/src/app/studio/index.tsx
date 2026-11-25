import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AudioFileStatus, AudioFileSummary, DanceStyle } from '@baile-latino/types';
import { Button } from '@/components/button';
import { ApiError } from '@/lib/api';
import { IN_PROGRESS, STUDIO_MAX_UPLOAD_MB, STUDIO_STYLES, audioMimeType, formatDuration, studioApi, uploadAudio } from '@/lib/studio';
import { colors, detailHeader, radius, space, ui } from '@/lib/theme';

const STATUS_LABEL: Record<AudioFileStatus, string> = {
  UPLOADING: 'Subiendo',
  QUEUED: 'En cola',
  PROCESSING: 'Analizando…',
  READY: 'Listo',
  ERROR: 'Error',
};

const DESCRIPTION: Record<string, string> = {
  BACHATA:
    'Sube una bachata y estudia dónde cae el 1 de cada frase, qué instrumentos suenan, dónde está el derecho y el mambo, y sus breaks.',
  SALSA: 'Sube una salsa y estudia el 1 de cada frase, los instrumentos y sus partes: coro, montuno, mambo y más.',
};

/** Estudio → Analizador: elegir estilo, subir una canción y la lista de "Mis canciones". */
export default function StudioLibraryScreen() {
  const params = useLocalSearchParams<{ style?: string }>();
  const [style, setStyle] = useState<DanceStyle>(params.style === 'SALSA' ? 'SALSA' : 'BACHATA');
  const qc = useQueryClient();
  const queryKey = ['studio', 'audio-files', style];
  const list = useQuery({
    queryKey,
    queryFn: () => studioApi.list(style),
    refetchInterval: (q) => (q.state.data?.some((f) => IN_PROGRESS.has(f.status)) ? 3000 : false),
  });
  const remove = useMutation({
    mutationFn: studioApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const confirmDelete = (f: AudioFileSummary) =>
    Alert.alert('¿Borrar la canción?', `"${f.originalName}": se eliminan el audio, su análisis y tus notas.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => remove.mutate(f.id) },
    ]);

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ ...detailHeader, title: '🎚️ Estudio' }} />
      <ScrollView
        contentContainerStyle={ui.scroll}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.clave} />
        }
      >
        <View style={styles.tabs}>
          {STUDIO_STYLES.map((s) => (
            <Pressable
              key={s.style}
              onPress={() => setStyle(s.style)}
              style={[styles.tab, style === s.style && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: style === s.style }}
            >
              <Text style={[styles.tabText, style === s.style && { color: colors.white }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={ui.muted}>{DESCRIPTION[style]} Repite tramos y baja la velocidad sin cambiar el tono.</Text>

        <UploadCard style={style} onUploaded={() => void qc.invalidateQueries({ queryKey })} />

        <Text style={ui.h2}>Mis canciones</Text>
        {list.isLoading && <ActivityIndicator color={colors.clave} />}
        {list.isError && (
          <Text style={ui.error}>{list.error instanceof ApiError ? list.error.message : 'No se pudo cargar el Estudio.'}</Text>
        )}
        {list.data?.length === 0 && <Text style={ui.small}>Todavía no subes canciones.</Text>}
        {list.data?.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => f.status === 'READY' && router.push({ pathname: '/studio/[id]', params: { id: f.id } })}
            onLongPress={() => confirmDelete(f)}
            style={({ pressed }) => [styles.row, pressed && f.status === 'READY' && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={ui.body} numberOfLines={1}>
                {f.originalName}
              </Text>
              <View style={styles.meta}>
                <Text
                  style={[
                    styles.badge,
                    f.status === 'READY' && { color: colors.nectar, backgroundColor: '#1a7a4e55' },
                    f.status === 'ERROR' && { color: colors.danger },
                  ]}
                >
                  {STATUS_LABEL[f.status]}
                </Text>
                {f.bpm !== null && <Text style={ui.small}>{Math.round(f.bpm)} BPM</Text>}
                <Text style={ui.small}>{formatDuration(f.durationMs)}</Text>
              </View>
              {f.error ? <Text style={[ui.small, { color: colors.danger }]}>{f.error}</Text> : null}
            </View>
            <Pressable onPress={() => confirmDelete(f)} hitSlop={10} accessibilityLabel={`Borrar ${f.originalName}`}>
              <Text style={{ color: colors.textFaint, fontSize: 18 }}>🗑</Text>
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Elegir un audio de Archivos, declarar el derecho de uso y subirlo. */
function UploadCard({ style, onUploaded }: { style: DanceStyle; onUploaded: () => void }) {
  const [asset, setAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [rights, setRights] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
    if (res.canceled) return;
    const a = res.assets[0];
    if (!audioMimeType(a)) return setError('Formato no permitido. Usa MP3, M4A, WAV o FLAC.');
    if ((a.size ?? 0) > STUDIO_MAX_UPLOAD_MB * 1024 * 1024) {
      return setError(`El archivo no puede superar ${STUDIO_MAX_UPLOAD_MB} MB.`);
    }
    setAsset(a);
  };

  const submit = async () => {
    if (!asset || !rights) return;
    setError(null);
    setProgress(0);
    try {
      await uploadAudio(asset, style, setProgress);
      setAsset(null);
      setRights(false);
      onUploaded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo subir el archivo.');
    } finally {
      setProgress(null);
    }
  };

  const uploading = progress !== null;
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>Subir una canción</Text>
      <Text style={ui.small}>
        MP3, M4A, WAV o FLAC, hasta {STUDIO_MAX_UPLOAD_MB} MB y 10 minutos. Tu audio es privado: solo tú lo puedes
        escuchar.
      </Text>
      <Button title={asset ? `🎵 ${asset.name}` : '🎵 Elegir audio'} variant="ghost" onPress={() => void pick()} disabled={uploading} />
      <View style={styles.rights}>
        <Switch
          value={rights}
          onValueChange={setRights}
          disabled={uploading}
          trackColor={{ true: colors.brand, false: colors.line }}
        />
        <Text style={[ui.small, { flex: 1 }]}>
          Declaro que tengo derecho a usar este archivo para mi práctica personal. No se comparte con otros usuarios.
        </Text>
      </View>
      {uploading && (
        <View style={{ gap: 4 }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((progress ?? 0) * 100)}%` }]} />
          </View>
          <Text style={ui.small}>Subiendo… {Math.round((progress ?? 0) * 100)}%</Text>
        </View>
      )}
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Button title={uploading ? 'Subiendo…' : 'Subir y analizar'} onPress={() => void submit()} disabled={!asset || !rights || uploading} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { color: colors.textMuted, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  badge: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.selva,
    overflow: 'hidden',
  },
  rights: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.clave },
});
