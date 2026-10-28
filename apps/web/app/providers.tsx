'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { PermissionsProvider } from '@/lib/permissions';

/**
 * Reintentar solo lo que puede mejorar solo: errores de red y 5xx (la API
 * reiniciándose, un corte de wifi). Un 4xx no se arregla repitiéndolo.
 */
function retryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    const retriable = error.status >= 500 || error.status === 408 || error.status === 429;
    if (!retriable) return false;
  }
  return failureCount < 2;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: retryQuery,
            // Al volver a la pestaña no se recarga todo (listas de 1000 temas),
            // PERO sí lo que quedó en error: si no, un fallo puntual (API
            // reiniciando) dejaba la pantalla vacía hasta recargar a mano.
            refetchOnWindowFocus: (query) => query.state.status === 'error',
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <PermissionsProvider>{children}</PermissionsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
