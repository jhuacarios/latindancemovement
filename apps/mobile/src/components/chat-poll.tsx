import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CHAT_POLL_MAX_OPTIONS,
  CHAT_POLL_MIN_OPTIONS,
  CHAT_POLL_OPTION_MAX,
  CHAT_POLL_QUESTION_MAX,
  type ChatPollDto,
  type CreateChatPollRequest,
} from '@baile-latino/types';
import { Button } from '@/components/button';
import { colors, radius, space, ui } from '@/lib/theme';

/**
 * Encuesta dentro de un mensaje: tocar una opción vota (en las de una sola opción
 * cambia el voto; tocar la marcada lo quita). Las barras muestran cuántos votaron.
 */
export function PollCard({
  poll,
  mine,
  width,
  onVote,
}: {
  poll: ChatPollDto;
  /** Va en mi globo (verde): colores claros. */
  mine: boolean;
  width: number;
  onVote: (optionIds: string[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const marked = poll.options.filter((o) => o.mine).map((o) => o.id);
  const fg = mine ? colors.white : colors.text;
  const faint = mine ? '#ffffffb3' : colors.textFaint;
  const accent = mine ? colors.white : colors.brand;

  const toggle = async (id: string) => {
    if (busy) return;
    const isOn = marked.includes(id);
    const next = poll.multiple ? (isOn ? marked.filter((x) => x !== id) : [...marked, id]) : isOn ? [] : [id];
    setBusy(true);
    try {
      await onVote(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ width }}>
      <Text style={[styles.question, { color: fg }]}>📊 {poll.question}</Text>
      <Text style={[styles.hint, { color: faint }]}>{poll.multiple ? 'Elige una o más opciones' : 'Elige una opción'}</Text>
      {poll.options.map((o) => {
        const pct = poll.totalVoters ? o.votes / poll.totalVoters : 0;
        return (
          <Pressable
            key={o.id}
            onPress={() => void toggle(o.id)}
            disabled={busy}
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
            accessibilityRole={poll.multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: o.mine }}
            accessibilityLabel={`${o.text}, ${o.votes} votos`}
          >
            <View style={styles.optionRow}>
              <View
                style={[
                  styles.check,
                  { borderRadius: poll.multiple ? 4 : 9, borderColor: o.mine ? accent : faint },
                  o.mine && { backgroundColor: accent },
                ]}
              >
                {o.mine ? <Text style={{ color: mine ? colors.brand : colors.white, fontSize: 11, fontWeight: '900' }}>✓</Text> : null}
              </View>
              <Text style={[styles.optionText, { color: fg }]}>{o.text}</Text>
              <Text style={[styles.count, { color: faint }]}>{o.votes}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: mine ? '#ffffff40' : colors.line }]}>
              <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: accent }]} />
            </View>
            {showVoters && o.voters.length > 0 ? (
              <Text style={[styles.voters, { color: faint }]}>
                {o.voters.join(', ')}
                {o.votes > o.voters.length ? ` y ${o.votes - o.voters.length} más` : ''}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
      <Pressable onPress={() => setShowVoters((v) => !v)} hitSlop={6}>
        <Text style={[styles.footer, { color: mine ? colors.white : colors.clave }]}>
          {poll.totalVoters === 0
            ? 'Nadie ha votado todavía'
            : `${poll.totalVoters} ${poll.totalVoters === 1 ? 'persona votó' : 'personas votaron'} · ${showVoters ? 'ocultar votos' : 'ver votos'}`}
        </Text>
      </Pressable>
      {busy ? <ActivityIndicator color={fg} size="small" style={{ position: 'absolute', right: 0, top: 0 }} /> : null}
    </View>
  );
}

/** Formulario para crear una encuesta (panel inferior). */
export function PollSheet({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (req: CreateChatPollRequest) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = Boolean(question.trim()) && filled.length >= CHAT_POLL_MIN_OPTIONS;

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
    setError(null);
  };
  // Como en WhatsApp: al escribir en la última opción aparece otra vacía.
  const setOption = (i: number, v: string) =>
    setOptions((prev) => {
      const next = prev.map((o, j) => (j === i ? v : o));
      if (i === next.length - 1 && v.trim() && next.length < CHAT_POLL_MAX_OPTIONS) next.push('');
      return next;
    });
  const removeOption = (i: number) =>
    setOptions((prev) => (prev.length <= CHAT_POLL_MIN_OPTIONS ? prev : prev.filter((_, j) => j !== i)));

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ question: question.trim(), options: filled, multiple });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo crear la encuesta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <Text style={ui.h2}>📊 Crear encuesta</Text>
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.sm }}>
            <Text style={ui.label}>Pregunta</Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              maxLength={CHAT_POLL_QUESTION_MAX}
              placeholder="Ej: ¿Qué día hacemos el ensayo?"
              placeholderTextColor={colors.textFaint}
              style={ui.input}
              autoFocus
            />
            <Text style={ui.label}>Opciones</Text>
            {options.map((o, i) => (
              <View key={i} style={styles.optionInputRow}>
                <TextInput
                  value={o}
                  onChangeText={(v) => setOption(i, v)}
                  maxLength={CHAT_POLL_OPTION_MAX}
                  placeholder={`Opción ${i + 1}`}
                  placeholderTextColor={colors.textFaint}
                  style={[ui.input, { flex: 1 }]}
                />
                {options.length > CHAT_POLL_MIN_OPTIONS ? (
                  <Pressable onPress={() => removeOption(i)} hitSlop={8} accessibilityLabel={`Quitar opción ${i + 1}`}>
                    <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <View style={styles.switchRow}>
              <Text style={ui.body}>Permitir varias respuestas</Text>
              <Switch value={multiple} onValueChange={setMultiple} trackColor={{ true: colors.brand, false: colors.line }} />
            </View>
          </ScrollView>
          {error ? <Text style={ui.error}>{error}</Text> : null}
          <Button title="Enviar encuesta" onPress={() => void submit()} loading={busy} disabled={!valid} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  question: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 11, marginBottom: 6 },
  option: { paddingVertical: 5 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { width: 18, height: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, fontSize: 14 },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { height: 5, borderRadius: 3, marginLeft: 26, marginTop: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  voters: { fontSize: 11, marginLeft: 26, marginTop: 2 },
  footer: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: '#00000066' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  optionInputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
});
