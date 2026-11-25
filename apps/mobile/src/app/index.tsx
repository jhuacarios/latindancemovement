import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { TAB_INFO, useMainTabs } from '@/lib/tab-prefs';
import { colors, ui } from '@/lib/theme';

/** Entrada de la app: a la primera pestaña que eligió el usuario (o al login). */
export default function Entry() {
  const { user, loading } = useAuth();
  const tabs = useMainTabs();
  if (!loading && !user) return <Redirect href="/login" />;
  if (loading || !tabs) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.clave} />
      </View>
    );
  }
  return <Redirect href={TAB_INFO[tabs[0]].path} />;
}
