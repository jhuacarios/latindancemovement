import { useEffect } from 'react';
import { Stack, DarkTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** Tema de navegación con los colores de Nectason (solo oscuro). */
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.clave,
    background: colors.selva,
    card: colors.selva,
    text: colors.text,
    border: colors.line,
  },
};

/** Oculta el splash cuando ya se sabe si hay sesión. */
function SplashGate() {
  const { loading } = useAuth();
  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);
  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          <SplashGate />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ gestureEnabled: false }} />
            <Stack.Screen
              name="chat/[id]"
              options={{
                headerShown: true,
                headerBackTitle: 'Mensajes',
                headerStyle: { backgroundColor: colors.selva },
                headerTintColor: colors.clave,
              }}
            />
            <Stack.Screen
              name="chat/new"
              options={{
                headerShown: true,
                title: 'Nuevo chat',
                presentation: 'modal',
                headerStyle: { backgroundColor: colors.selva },
                headerTintColor: colors.clave,
                headerTitleStyle: { color: colors.text },
              }}
            />
            <Stack.Screen
              name="place/[id]"
              options={{
                headerShown: true,
                headerBackTitle: 'Sociales',
                headerStyle: { backgroundColor: colors.selva },
                headerTintColor: colors.clave,
                headerTitleStyle: { color: colors.text },
              }}
            />
            <Stack.Screen
              name="event/[id]"
              options={{
                headerShown: true,
                headerBackTitle: 'Eventos',
                headerStyle: { backgroundColor: colors.selva },
                headerTintColor: colors.clave,
                headerTitleStyle: { color: colors.text },
              }}
            />
            <Stack.Screen
              name="academy/[id]"
              options={{
                headerShown: true,
                headerBackTitle: 'Academias',
                headerStyle: { backgroundColor: colors.selva },
                headerTintColor: colors.clave,
                headerTitleStyle: { color: colors.text },
              }}
            />
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
