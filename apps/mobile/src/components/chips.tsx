import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, radius, space } from '@/lib/theme';

/** Fila horizontal de opciones (una seleccionada). `null` = "Todas". */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  allLabel = 'Todas',
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  allLabel?: string;
}) {
  const all = [{ value: null as T | null, label: allLabel }, ...options];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {all.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value ?? '__all'}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Etiqueta de estilo (ámbar = bachata, rojo = salsa), como en la web. */
export function StyleTag({ style }: { style: string }) {
  const bachata = style.startsWith('BACHATA');
  return (
    <Text
      style={[
        styles.tag,
        { color: bachata ? colors.bachata : colors.salsa, backgroundColor: bachata ? '#f59e0b22' : '#ef444422' },
      ]}
    >
      {bachata ? 'Bachata' : 'Salsa'}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  text: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  textOn: { color: colors.white },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
