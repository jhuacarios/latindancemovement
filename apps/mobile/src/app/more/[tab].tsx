import type { ComponentType } from 'react';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import AcademiesScreen from '../(tabs)/academies';
import EventsScreen from '../(tabs)/events';
import MessagesScreen from '../(tabs)/messages';
import ProfileScreen from '../(tabs)/profile';
import SocialsScreen from '../(tabs)/socials';
import { TAB_INFO, TAB_NAMES, type TabName } from '@/lib/tab-prefs';
import { detailHeader } from '@/lib/theme';

const SCREENS: Record<TabName, ComponentType> = {
  socials: SocialsScreen,
  events: EventsScreen,
  academies: AcademiesScreen,
  messages: MessagesScreen,
  profile: ProfileScreen,
};

/** Una pestaña que no está en la barra, abierta desde "Más" (con botón para volver). */
export default function OverflowTabScreen() {
  const { tab } = useLocalSearchParams<{ tab: string }>();
  if (!(TAB_NAMES as readonly string[]).includes(tab)) return <Redirect href="/" />;
  const name = tab as TabName;
  const Screen = SCREENS[name];
  return (
    <>
      <Stack.Screen
        options={{
          ...detailHeader,
          title: TAB_INFO[name].label,
          headerBackTitle: 'Volver',
        }}
      />
      <Screen />
    </>
  );
}
