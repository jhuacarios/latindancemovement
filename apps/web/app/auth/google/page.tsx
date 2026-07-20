'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AuthTokens, PublicUser } from '@baile-latino/types';
import { api, ApiError, setTokens } from '@/lib/api';
import { Card, Spinner } from '@/components/ui';

/**
 * Destino del redirect tras el login con Google. Lee el código de un solo uso
 * de la URL, lo canjea por la sesión y recarga en el home (para que el
 * AuthProvider levante el usuario).
 */
export default function GoogleCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('error')) {
      setError('No se pudo iniciar sesión con Google. Intenta de nuevo.');
      return;
    }
    const code = sp.get('code');
    if (!code) {
      setError('Falta el código de ingreso.');
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await api<{ user: PublicUser; tokens: AuthTokens }>(
          '/auth/google/exchange',
          { method: 'POST', body: { code } },
        );
        setTokens(res.tokens);
        // Recarga completa: el AuthProvider tomará la sesión desde el token.
        window.location.replace('/inicio');
      } catch (e) {
        if (active) {
          setError(
            e instanceof ApiError ? e.message : 'No se pudo completar el ingreso.',
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm text-center">
        {error ? (
          <>
            <p className="mb-4 text-sm text-red-300">{error}</p>
            <Link href="/login" className="text-sm text-brand hover:underline">
              ← Volver al inicio de sesión
            </Link>
          </>
        ) : (
          <Spinner label="Entrando con Google…" />
        )}
      </Card>
    </main>
  );
}
