'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { AuthTokens, PublicUser } from '@baile-latino/types';
import { api, clearTokens, getAccessToken, setTokens } from './api';

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Al montar: si hay token, recupera el usuario actual.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<PublicUser>('/auth/me');
        if (active) setUser(me);
      } catch {
        clearTokens();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: PublicUser; tokens: AuthTokens }>(
      '/auth/login',
      { method: 'POST', body: { email, password } },
    );
    setTokens(res.tokens);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
