import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { AuthTokens, PublicUser } from '@baile-latino/types';
import { API_BASE, ApiError, api, clearTokens, hasSession, setTokens } from './api';

interface AuthState {
  user: PublicUser | null;
  /** Revisando si hay una sesión guardada. */
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (u: PublicUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Al abrir la app: si hay tokens guardados, recupera el usuario.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (await hasSession()) {
          const me = await api<PublicUser>('/auth/me');
          if (active) setUser(me);
        }
      } catch {
        /* sesión vencida: queda en el login */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /**
   * Login con Google en el navegador del sistema. La API vuelve a la app
   * (`nectason://auth` en builds, `exp://…/--/auth` en Expo Go) con un código
   * de un solo uso, que se canjea por la sesión: los tokens no viajan en la URL.
   */
  const loginWithGoogle = useCallback(async () => {
    const returnUrl = Linking.createURL('auth');
    const url = `${API_BASE}/auth/google?app=${encodeURIComponent(returnUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
    if (result.type !== 'success') return; // canceló
    const { queryParams } = Linking.parse(result.url);
    if (queryParams?.error) throw new ApiError(400, 'No se pudo entrar con Google. Intenta de nuevo.');
    const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
    if (!code) throw new ApiError(400, 'Google no devolvió el código de acceso.');
    const res = await api<{ user: PublicUser; tokens: AuthTokens }>('/auth/google/exchange', {
      method: 'POST',
      body: { code },
    });
    await setTokens(res.tokens);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return ctx;
}
