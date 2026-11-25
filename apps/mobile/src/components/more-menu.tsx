import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_INFO, type TabName } from '@/lib/tab-prefs';
import { colors, radius, space } from '@/lib/theme';

interface RadialOption {
  key: string;
  emoji: string;
  label: string;
  href: Href;
}

/** Submenú radial de "Estudio" (mantener apretado). */
const STUDIO_OPTIONS: RadialOption[] = [
  {
    key: 'bachata',
    emoji: '🎸',
    label: 'Bachata',
    href: { pathname: '/studio', params: { style: 'BACHATA' } },
  },
  {
    key: 'salsa',
    emoji: '🎺',
    label: 'Salsa',
    href: { pathname: '/studio', params: { style: 'SALSA' } },
  },
];

const HOLD_MS = 300;
const RADIUS = 104;
const OPTION = 62;
/** El dedo tiene que alejarse esto del punto apretado para elegir una opción. */
const PICK_MIN_DIST = 40;
const PICK_MAX_ANGLE = 40;

/** Ángulo de cada opción (grados; 90 = arriba, 180 = izquierda): el menú está a la derecha. */
const angleOf = (i: number, n: number) => 90 + (90 * (i + 0.5)) / n;
const offsetOf = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: RADIUS * Math.cos(rad), y: -RADIUS * Math.sin(rad) };
};

interface Row {
  key: string;
  emoji: string;
  label: string;
  hint?: string;
  badge?: number;
  onPress: () => void;
  radial?: RadialOption[];
}

/**
 * Menú de la pestaña "Más": se despliega hacia arriba, sobre la barra. Trae las
 * pestañas que no están en la barra, las herramientas y "Configurar pestañas".
 * En una herramienta con submenú (Estudio), mantener apretado abre un menú radial:
 * se arrastra el dedo hasta la opción y se suelta. Un toque corto la abre directo.
 */
export function MoreMenu({
  open,
  onClose,
  overflow,
  unread,
}: {
  open: boolean;
  onClose: () => void;
  overflow: TabName[];
  unread: number;
}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);

  // Radial: dónde se apretó, qué opciones y cuál está bajo el dedo.
  const [radial, setRadial] = useState<{
    x: number;
    y: number;
    options: RadialOption[];
  } | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const radialRef = useRef<typeof radial>(null);
  const hotRef = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.spring(anim, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    if (!open) closeRadial();
  }, [open, anim]);

  useEffect(() => {
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const go = (href: Href) => {
    onClose();
    router.push(href);
  };

  function closeRadial() {
    radialRef.current = null;
    hotRef.current = null;
    setRadial(null);
    setHot(null);
  }

  const rows: Row[] = [
    ...overflow.map((t) => ({
      key: t,
      emoji: TAB_INFO[t].emoji,
      label: TAB_INFO[t].label,
      badge: t === 'messages' ? unread : 0,
      onPress: () => go({ pathname: '/more/[tab]', params: { tab: t } }),
    })),
    {
      key: 'studio',
      emoji: '🎚️',
      label: 'Estudio',
      hint: 'Mantén para elegir estilo',
      onPress: () => go('/studio'),
      radial: STUDIO_OPTIONS,
    },
    {
      key: 'config',
      emoji: '⚙️',
      label: 'Configurar pestañas',
      onPress: () => go('/tabs-config'),
    },
  ];

  /** Opción del radial bajo el dedo (por ángulo), o ninguna si sigue cerca del centro. */
  const optionAt = (e: GestureResponderEvent): number | null => {
    const r = radialRef.current;
    if (!r) return null;
    const dx = e.nativeEvent.pageX - r.x;
    const dy = e.nativeEvent.pageY - r.y;
    if (Math.hypot(dx, dy) < PICK_MIN_DIST) return null;
    const deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
    let best: number | null = null;
    let bestDiff = PICK_MAX_ANGLE;
    r.options.forEach((_, i) => {
      const diff = Math.abs(((deg - angleOf(i, r.options.length) + 540) % 360) - 180);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    });
    return best;
  };

  /** Toque corto = abrir; mantener = radial (arrastrar y soltar sobre la opción). */
  const responders = (row: Row) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => !radialRef.current,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, pageY } = e.nativeEvent;
      if (!row.radial) return;
      const options = row.radial;
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        radialRef.current = { x: pageX, y: pageY, options };
        setRadial(radialRef.current);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, HOLD_MS);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      if (!radialRef.current) return;
      const next = optionAt(e);
      if (next !== hotRef.current) {
        hotRef.current = next;
        setHot(next);
        if (next !== null) void Haptics.selectionAsync();
      }
    },
    onResponderRelease: () => {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
        return row.onPress(); // toque corto
      }
      const r = radialRef.current;
      const picked = hotRef.current;
      closeRadial();
      if (r && picked !== null) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        go(r.options[picked].href);
      }
    },
    onResponderTerminate: () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
      closeRadial();
    },
  });

  if (!mounted) return null;
  const tabBar = Platform.OS === 'ios' ? 49 : 80;
  const n = rows.length;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar menú" />
      </Animated.View>

      <View style={[styles.column, { bottom: tabBar + insets.bottom + space.sm }]} pointerEvents="box-none">
        {rows.map((row, i) => {
          // Se despliegan de abajo hacia arriba: la de más abajo aparece primero.
          const fromBottom = n - 1 - i;
          const start = Math.min(0.6, fromBottom * 0.12);
          const t = anim.interpolate({
            inputRange: [start, Math.min(1, start + 0.4)],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={row.key}
              style={{
                opacity: t,
                transform: [
                  {
                    translateY: t.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24 + fromBottom * 8, 0],
                    }),
                  },
                ],
              }}
            >
              <View
                {...responders(row)}
                style={[styles.row, radial && row.radial && styles.rowHeld]}
                accessible
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityHint={row.hint}
              >
                <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                  <Text style={styles.label}>{row.label}</Text>
                  {row.hint ? <Text style={styles.hint}>{row.hint}</Text> : null}
                </View>
                <View style={styles.icon}>
                  <Text style={{ fontSize: 22 }}>{row.emoji}</Text>
                  {row.badge ? <Text style={styles.badge}>{row.badge > 99 ? '99+' : row.badge}</Text> : null}
                </View>
              </View>
            </Animated.View>
          );
        })}
      </View>

      {radial && (
        <View pointerEvents="none" style={[styles.anchor, { left: radial.x, top: radial.y }]}>
          <View style={styles.center} />
          {radial.options.map((o, i) => {
            const { x, y } = offsetOf(angleOf(i, radial.options.length));
            const isHot = hot === i;
            return (
              <View key={o.key} style={[styles.optionWrap, { transform: [{ translateX: x }, { translateY: y }] }]}>
                <View style={[styles.option, isHot && styles.optionHot]}>
                  <Text style={{ fontSize: 26 }}>{o.emoji}</Text>
                </View>
                <Text style={[styles.optionLabel, isHot && { color: colors.clave }]}>{o.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000000b3' },
  column: {
    position: 'absolute',
    right: space.md,
    alignItems: 'flex-end',
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowHeld: { borderColor: colors.clave },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.textFaint, fontSize: 10 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.selva,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: colors.danger,
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  anchor: { position: 'absolute', width: 0, height: 0 },
  center: {
    position: 'absolute',
    left: -14,
    top: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.clave,
  },
  optionWrap: {
    position: 'absolute',
    left: -OPTION / 2,
    top: -OPTION / 2,
    width: OPTION,
    alignItems: 'center',
  },
  option: {
    width: OPTION,
    height: OPTION,
    borderRadius: OPTION / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionHot: {
    backgroundColor: colors.brand,
    borderColor: colors.clave,
    borderWidth: 2,
    transform: [{ scale: 1.15 }],
  },
  optionLabel: {
    marginTop: 4,
    width: 80,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
});
