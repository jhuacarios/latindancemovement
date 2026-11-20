import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { AcademyClassDto } from '@baile-latino/types';
import { academiesApi } from '@/lib/academies';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/button';
import { colors, radius, space, ui } from '@/lib/theme';

export function enrolledLabel(c: AcademyClassDto): string {
  return c.capacity ? `${c.enrolledCount}/${c.capacity} inscritos` : `${c.enrolledCount} inscritos`;
}

/** Píldora corta con el estado de mi inscripción (para el horario). */
export function EnrollPill({ c }: { c: AcademyClassDto }) {
  if (c.myEnrollment === 'ACCEPTED') {
    return <Text style={[styles.pill, { color: colors.clave, backgroundColor: '#1a7a4e33' }]}>✓ Inscrito</Text>;
  }
  if (c.myEnrollment === 'PENDING') {
    return <Text style={[styles.pill, { color: colors.bachata, backgroundColor: '#f59e0b22' }]}>⏳ Pendiente</Text>;
  }
  return null;
}

/** Pedir inscripción / estado (pendiente, inscrito, rechazado). Lo decide el director. */
export function EnrollBox({ academyId, c }: { academyId: string; c: AcademyClassDto }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const full = c.capacity !== null && c.enrolledCount >= c.capacity;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setAsking(false);
      setMessage('');
      await qc.invalidateQueries({ queryKey: ['academy', academyId] });
      await qc.invalidateQueries({ queryKey: ['academy-media', academyId] });
      await qc.invalidateQueries({ queryKey: ['my-enrollments'] });
    } catch (e) {
      Alert.alert('No se pudo', e instanceof ApiError ? e.message : 'Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  if (c.myEnrollment === 'ACCEPTED') {
    return (
      <View style={styles.row}>
        <EnrollPill c={c} />
        <Text
          style={styles.linkMuted}
          onPress={() =>
            Alert.alert('Dejar la clase', `Saldrás de "${c.title}" y de su chat.`, [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Dejar',
                style: 'destructive',
                onPress: () => void run(() => academiesApi.unenroll(academyId, c.id)),
              },
            ])
          }
        >
          Dejar la clase
        </Text>
      </View>
    );
  }
  if (c.myEnrollment === 'PENDING') {
    return (
      <View style={{ gap: 6 }}>
        <View style={styles.row}>
          <Text style={[styles.pill, { color: colors.bachata, backgroundColor: '#f59e0b22' }]}>
            ⏳ Solicitud enviada{full ? ' (en espera)' : ''}
          </Text>
          <Text style={styles.linkMuted} onPress={() => void run(() => academiesApi.unenroll(academyId, c.id))}>
            Cancelar
          </Text>
        </View>
        <Text style={ui.small}>El director revisará tu solicitud; te avisará por mensaje.</Text>
      </View>
    );
  }
  if (!c.active) return <Text style={ui.muted}>Esta clase no está recibiendo alumnos.</Text>;
  if (asking) {
    return (
      <View style={{ gap: space.sm }}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Mensaje para el director (opcional)"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={500}
          style={[ui.input, { minHeight: 64, textAlignVertical: 'top' }]}
        />
        <View style={styles.row}>
          <Button
            title="Enviar solicitud"
            onPress={() => void run(() => academiesApi.enroll(academyId, c.id, message))}
            loading={busy}
            style={{ flex: 1 }}
          />
          <Button title="Cancelar" variant="ghost" onPress={() => setAsking(false)} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      {full && <Text style={ui.small}>La clase está llena: tu solicitud quedará en espera.</Text>}
      <Button
        title={c.myEnrollment === 'REJECTED' ? 'Volver a pedir inscripción' : 'Solicitar inscripción'}
        onPress={() => setAsking(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  linkMuted: { color: colors.textMuted, fontSize: 13 },
  pill: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
});
