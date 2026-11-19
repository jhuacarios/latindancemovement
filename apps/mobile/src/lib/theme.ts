import { StyleSheet } from 'react-native';

/** Paleta Nectason (la misma de la web; ver BRANDING.md). La app es solo modo oscuro. */
export const colors = {
  selva: '#0d1f1a', // fondo
  surface: '#13291f', // tarjetas
  line: '#244536', // bordes
  brand: '#1a7a4e', // Son
  brandDark: '#145c3b',
  clave: '#4ec990',
  nectar: '#b6f0d0',
  text: '#e8f5e2', // Sabor
  textMuted: '#9fb8a8',
  textFaint: '#6b8a78',
  bachata: '#f59e0b',
  salsa: '#ef4444',
  danger: '#f87171',
  white: '#ffffff',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Estilos compartidos entre pantallas. */
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.selva },
  scroll: { padding: space.lg, gap: space.lg },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 18, fontWeight: '600' },
  body: { color: colors.text, fontSize: 15 },
  muted: { color: colors.textMuted, fontSize: 14 },
  small: { color: colors.textFaint, fontSize: 12 },
  error: { color: colors.danger, fontSize: 14 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: colors.selva,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
});
