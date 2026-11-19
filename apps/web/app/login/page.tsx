'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, Card } from '@/components/ui';
import { BrandLogo, Wordmark } from '@/components/brand';
import { GoogleIcon } from '@/components/google-icon';

/**
 * Solo se entra con Google. El login con email/contraseña sigue en la API
 * (`POST /auth/login`) para pruebas o emergencias, pero no se ofrece en la web.
 */
export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.replace('/inicio');
  }, [user, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-1 flex items-center gap-2">
          <BrandLogo className="h-10 w-10" />
          <Wordmark className="text-2xl" />
        </div>
        <p className="mb-6 text-sm text-neutral-400">
          Conecta. Baila. Vive. · Panel de música y DJs
        </p>

        <Button
          type="button"
          className="w-full"
          onClick={() => {
            const api =
              process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
            window.location.href = `${api}/auth/google`;
          }}
        >
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">
            <GoogleIcon className="h-3.5 w-3.5" />
          </span>
          Entrar con Google
        </Button>
      </Card>
    </main>
  );
}
