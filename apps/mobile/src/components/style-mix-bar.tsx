import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import { mixLabel } from '@/lib/places';

/** Barrita bachata (ámbar) / salsa (rojo) con su etiqueta. */
export function StyleMixBar({ pct, showLabel = true }: { pct: number; showLabel?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.bar}>
        <View style={{ width: `${pct}%`, backgroundColor: colors.bachata }} />
        <View style={{ width: `${100 - pct}%`, backgroundColor: colors.salsa }} />
      </View>
      {showLabel && <Text style={styles.label}>{mixLabel(pct)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { flexDirection: 'row', width: 64, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.line },
  label: { color: colors.textMuted, fontSize: 12 },
});
