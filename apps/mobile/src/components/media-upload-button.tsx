import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { isDuplicateError, pickMedia, uploadAcademyMedia } from '@/lib/media-upload';
import { Button } from '@/components/button';
import { colors, space, ui } from '@/lib/theme';

/** Elige fotos y videos del teléfono y los sube uno por uno a la galería (o a una clase). */
export function MediaUploadButton({ academyId, classId }: { academyId: string; classId: string | null }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<{ i: number; n: number; pct: number } | null>(null);

  const start = async () => {
    let assets;
    try {
      assets = await pickMedia();
    } catch {
      Alert.alert('No se pudo', 'No se pudo abrir la galería del teléfono.');
      return;
    }
    if (assets.length === 0) return;
    let ok = 0;
    let repeated = 0;
    const failed: string[] = [];
    for (let i = 0; i < assets.length; i++) {
      setStatus({ i: i + 1, n: assets.length, pct: 0 });
      try {
        await uploadAcademyMedia(academyId, assets[i], classId, (f) =>
          setStatus({ i: i + 1, n: assets.length, pct: Math.round(f * 100) }),
        );
        ok++;
      } catch (e) {
        if (isDuplicateError(e)) repeated++;
        else failed.push(e instanceof ApiError ? e.message : 'Error desconocido.');
        // Un cupo lleno o sin plan corta el lote: los siguientes fallarían igual.
        if (e instanceof ApiError && e.status === 403) break;
      }
    }
    setStatus(null);
    void qc.invalidateQueries({ queryKey: ['academy-media', academyId] });
    void qc.invalidateQueries({ queryKey: ['academy', academyId] });
    const lines = [
      ok ? `✓ ${ok} subido${ok === 1 ? '' : 's'}.` : null,
      repeated ? `${repeated} ya estaba${repeated === 1 ? '' : 'n'} en la galería (se saltaron).` : null,
      failed.length ? `No se pudieron subir ${failed.length}: ${[...new Set(failed)].join(' ')}` : null,
    ].filter(Boolean);
    Alert.alert(failed.length && !ok ? 'No se pudo subir' : 'Listo', lines.join('\n'));
  };

  if (status) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={ui.small}>
          Subiendo {status.i} de {status.n} · {status.pct}% — no cierres la app.
        </Text>
        <View style={styles.track}>
          <View style={[styles.bar, { width: `${status.pct}%` }]} />
        </View>
      </View>
    );
  }
  return <Button title="⬆️ Subir fotos o videos" variant="ghost" onPress={() => void start()} />;
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden', marginBottom: space.xs },
  bar: { height: '100%', backgroundColor: colors.brand },
});
