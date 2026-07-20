'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';
import { BrandLogo, Wordmark } from '@/components/brand';
import { GoogleIcon } from '@/components/google-icon';

/**
 * Landing público (ruta "/"). Renderiza el HTML de marketing y engancha los
 * CTAs "Entrar" (marcados con [data-login]) para abrir el login en un modal —
 * sin salir de la página. Si ya hay sesión, el CTA lleva al panel.
 */
export function Landing({ html }: { html: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const trigger = (e.target as HTMLElement).closest('[data-login]');
      if (!trigger) return;
      e.preventDefault();
      if (user) router.push('/inicio');
      else setShowLogin(true);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [user, router]);

  return (
    <>
      <div ref={rootRef} dangerouslySetInnerHTML={{ __html: html }} />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}

function LoginModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Iniciar sesión"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
        <Card>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BrandLogo className="h-9 w-9" />
                <Wordmark className="text-2xl" />
              </div>
              <p className="mt-1 text-sm text-neutral-400">
                Entra a tu panel de música y DJs.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-md px-2 py-1 text-lg leading-none text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
            >
              ✕
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-neutral-300">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
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
            <div className="h-px flex-1 bg-neutral-800" />o
            <div className="h-px flex-1 bg-neutral-800" />
          </div>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              const api =
                process.env.NEXT_PUBLIC_API_URL ??
                'http://localhost:3000/api/v1';
              window.location.href = `${api}/auth/google`;
            }}
          >
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">
              <GoogleIcon className="h-3.5 w-3.5" />
            </span>
            Entrar con Google
          </Button>
        </Card>
      </div>
    </div>
  );
}
