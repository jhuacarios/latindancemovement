import { View } from 'react-native';
import { ui } from '@/lib/theme';

/**
 * Pestaña "Más": no se abre nunca (está deshabilitada en la barra); al tocarla se
 * despliega el menú de `components/more-menu.tsx`. El archivo existe porque cada
 * pestaña necesita su ruta.
 */
export default function MoreTab() {
  return <View style={ui.screen} />;
}
