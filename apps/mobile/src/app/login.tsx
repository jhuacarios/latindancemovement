import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/button';
import { colors, space, ui } from '@/lib/theme';

/** Solo se entra con Google (igual que la web). */
export default function LoginScreen() {
  const { user, loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Redirect href="/" />;

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo entrar. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen}>
      <View style={styles.center}>
        <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
        <Text style={styles.brand}>
          necta<Text style={{ color: colors.clave }}>son</Text>
        </Text>
        <Text style={[ui.muted, styles.tagline]}>Conecta. Baila. Vive.</Text>
        <Button title="Entrar con Google" onPress={() => void login()} loading={busy} style={styles.button} />
        {error && <Text style={[ui.error, styles.tagline]}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  logo: { width: 96, height: 96, borderRadius: 24 },
  brand: { color: colors.text, fontSize: 34, fontWeight: '700' },
  tagline: { textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: space.xl },
});
