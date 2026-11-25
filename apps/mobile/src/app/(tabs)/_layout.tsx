import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { MoreMenu } from '@/components/more-menu';
import { useAuth } from '@/lib/auth';
import { useUnreadChat } from '@/lib/chat';
import { TAB_INFO, TAB_NAMES, type TabName, useMainTabs } from '@/lib/tab-prefs';
import { colors, ui } from '@/lib/theme';

const ICONS = {
  socials: { sf: 'figure.socialdance', md: 'groups' },
  events: { sf: 'calendar', md: 'event' },
  academies: { sf: 'graduationcap', md: 'school' },
  messages: { sf: 'bubble.left.and.bubble.right', md: 'chat' },
  profile: { sf: 'person.crop.circle', md: 'person' },
} as const satisfies Record<TabName, unknown>;

const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/**
 * Pestañas de la app (nativas: estilo iOS / Material según el teléfono). Requieren sesión.
 * Las 4 primeras las elige el usuario (Más → Configurar pestañas); la quinta es "Más",
 * que no navega: despliega un menú con el resto.
 */
export default function TabsLayout() {
  const { user, loading } = useAuth();
  const unread = useUnreadChat();
  const tabs = useMainTabs();
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading || !tabs) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.clave} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  const overflow = TAB_NAMES.filter((t) => !tabs.includes(t));
  const moreBadge = overflow.includes('messages') ? unread : 0;

  return (
    <View style={{ flex: 1 }}>
      {/* key: al cambiar las pestañas se rearma la barra nativa desde cero */}
      <NativeTabs
        key={tabs.join(',')}
        backgroundColor={colors.selva}
        indicatorColor={colors.surface}
        labelStyle={{ selected: { color: colors.clave } }}
      >
        {[...tabs, ...overflow].map((name) => (
          <NativeTabs.Trigger key={name} name={name} hidden={!tabs.includes(name)}>
            <NativeTabs.Trigger.Label>{TAB_INFO[name].label}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={ICONS[name].sf} md={ICONS[name].md} />
            {name === 'messages' && (
              <NativeTabs.Trigger.Badge hidden={unread === 0}>{badgeText(unread)}</NativeTabs.Trigger.Badge>
            )}
          </NativeTabs.Trigger>
        ))}
        <NativeTabs.Trigger name="more" disabled listeners={{ tabPress: () => setMenuOpen((v) => !v) }}>
          <NativeTabs.Trigger.Label>Más</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="ellipsis.circle" md="more_horiz" />
          <NativeTabs.Trigger.Badge hidden={moreBadge === 0}>{badgeText(moreBadge)}</NativeTabs.Trigger.Badge>
        </NativeTabs.Trigger>
      </NativeTabs>
      <MoreMenu open={menuOpen} onClose={() => setMenuOpen(false)} overflow={overflow} unread={unread} />
    </View>
  );
}
