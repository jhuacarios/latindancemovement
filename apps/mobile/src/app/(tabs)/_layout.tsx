import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useAuth } from '@/lib/auth';
import { useUnreadChat } from '@/lib/chat';
import { colors, ui } from '@/lib/theme';

/** Pestañas de la app (nativas: estilo iOS / Material según el teléfono). Requieren sesión. */
export default function TabsLayout() {
  const { user, loading } = useAuth();
  const unread = useUnreadChat();

  if (loading) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.clave} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <NativeTabs
      backgroundColor={colors.selva}
      indicatorColor={colors.surface}
      labelStyle={{ selected: { color: colors.clave } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Sociales</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.socialdance" md="groups" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Label>Eventos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="event" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="academies">
        <NativeTabs.Trigger.Label>Academias</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="graduationcap" md="school" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages">
        <NativeTabs.Trigger.Label>Mensajes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right" md="chat" />
        <NativeTabs.Trigger.Badge hidden={unread === 0}>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
