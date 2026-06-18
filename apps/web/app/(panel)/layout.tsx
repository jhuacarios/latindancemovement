'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';

const NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/tracks', label: 'Canciones' },
  { href: '/playlists', label: 'Playlists' },
  { href: '/reports', label: 'Reportes' },
];

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40 p-4">
        <div className="mb-6 px-2 text-lg font-bold">
          Baile<span className="text-brand">Latino</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'rounded-lg px-3 py-2 text-sm transition',
                  active
                    ? 'bg-brand/15 text-brand'
                    : 'text-neutral-300 hover:bg-neutral-800',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
          <div className="text-sm text-neutral-400">Panel de música y DJs</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-300">
              {user.name}{' '}
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                {user.role}
              </span>
            </span>
            <Button variant="ghost" onClick={logout}>
              Salir
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
