import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space, ui } from '@/lib/theme';

/** Pantalla provisoria de las secciones que vienen en las próximas etapas. */
export function ComingSoon({ title, emoji, text }: { title: string; emoji: string; text: string }) {
  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <View style={[ui.scroll, { flex: 1 }]}>
        <Text style={ui.h1}>{title}</Text>
        <View style={[ui.card, { alignItems: 'center', paddingVertical: space.xxl }]}>
          <Text style={{ fontSize: 40 }}>{emoji}</Text>
          <Text style={[ui.muted, { textAlign: 'center' }]}>{text}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
