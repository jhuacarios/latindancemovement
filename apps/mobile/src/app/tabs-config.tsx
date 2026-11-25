import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button } from '@/components/button';
import {
  DEFAULT_TABS,
  MAIN_TABS,
  TAB_INFO,
  TAB_NAMES,
  type TabName,
  useMainTabs,
  useSaveMainTabs,
} from '@/lib/tab-prefs';
import { colors, detailHeader, radius, space, ui } from '@/lib/theme';

/** Elegir qué 4 pestañas van en la barra y en qué orden; el resto queda en "Más". */
export default function TabsConfigScreen() {
  const current = useMainTabs() ?? DEFAULT_TABS;
  const save = useSaveMainTabs();
  const [main, setMain] = useState<TabName[]>(current);
  const [saving, setSaving] = useState(false);
  const rest = TAB_NAMES.filter((t) => !main.includes(t));
  const full = main.length === MAIN_TABS;
  const changed = main.join(',') !== current.join(',');

  const move = (i: number, d: -1 | 1) =>
    setMain((m) => {
      const j = i + d;
      if (j < 0 || j >= m.length) return m;
      const next = [...m];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const submit = async () => {
    setSaving(true);
    try {
      await save(main);
      router.back();
    } catch {
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ ...detailHeader, title: 'Configurar pestañas' }} />
      <ScrollView contentContainerStyle={ui.scroll}>
        <Text style={ui.muted}>
          Elige las {MAIN_TABS} pestañas de la barra y su orden. Lo demás queda en «Más», junto a las herramientas.
        </Text>

        <Text style={ui.h2}>
          En la barra ({main.length} de {MAIN_TABS})
        </Text>
        {main.map((t, i) => (
          <View key={t} style={styles.row}>
            <Text style={styles.emoji}>{TAB_INFO[t].emoji}</Text>
            <Text style={[ui.body, { flex: 1 }]}>{TAB_INFO[t].label}</Text>
            <RowButton label="↑" hint={`Subir ${TAB_INFO[t].label}`} onPress={() => move(i, -1)} disabled={i === 0} />
            <RowButton
              label="↓"
              hint={`Bajar ${TAB_INFO[t].label}`}
              onPress={() => move(i, 1)}
              disabled={i === main.length - 1}
            />
            <RowButton
              label="−"
              hint={`Pasar ${TAB_INFO[t].label} a Más`}
              onPress={() => setMain((m) => m.filter((x) => x !== t))}
            />
          </View>
        ))}
        <View style={[styles.row, styles.fixed]}>
          <Text style={styles.emoji}>⋯</Text>
          <Text style={[ui.body, { flex: 1 }]}>Más</Text>
          <Text style={ui.small}>siempre al final</Text>
        </View>

        <Text style={ui.h2}>En «Más»</Text>
        {rest.length === 0 && <Text style={ui.small}>Nada: todas están en la barra.</Text>}
        {rest.map((t) => (
          <View key={t} style={styles.row}>
            <Text style={styles.emoji}>{TAB_INFO[t].emoji}</Text>
            <Text style={[ui.body, { flex: 1 }]}>{TAB_INFO[t].label}</Text>
            <RowButton
              label="+"
              hint={`Agregar ${TAB_INFO[t].label} a la barra`}
              onPress={() => setMain((m) => [...m, t])}
              disabled={full}
            />
          </View>
        ))}
        {!full && <Text style={ui.small}>Agrega {MAIN_TABS - main.length} más para completar la barra.</Text>}

        <Button
          title={saving ? 'Guardando…' : 'Guardar'}
          onPress={() => void submit()}
          disabled={!full || !changed || saving}
        />
        <Button
          title="Volver a las de siempre"
          variant="ghost"
          onPress={() => setMain(DEFAULT_TABS)}
          disabled={saving}
        />
      </ScrollView>
    </View>
  );
}

function RowButton({
  label,
  hint,
  onPress,
  disabled,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.btn, disabled && { opacity: 0.3 }, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={hint}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  fixed: { opacity: 0.6 },
  emoji: { fontSize: 20, width: 28, textAlign: 'center', color: colors.text },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.clave, fontSize: 18, fontWeight: '700' },
});
