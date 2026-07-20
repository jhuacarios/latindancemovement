'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';
import { BrandLogo, Wordmark } from '@/components/brand';
import { GoogleIcon } from '@/components/google-icon';

export default function LoginPage() {
  const router = useRouter();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('dj@bailelatino.cl');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace('/inicio');
  }, [user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/inicio');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo iniciar sesión',
      );
    } finally {
      setSubmitting(false);
    }
  }

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

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-neutral-300">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-300">
              Contraseña
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Iniciar sesión'}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-neutral-500">
          <div className="h-px flex-1 bg-neutral-800" />
          o
          <div className="h-px flex-1 bg-neutral-800" />
        </div>

        <Button
          type="button"
          variant="ghost"
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
