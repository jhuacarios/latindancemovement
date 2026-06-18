'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { accessibleModules } from '@/lib/modules';
import { Card } from '@/components/ui';
import { clsx } from '@/components/clsx';

export default function HomePage() {
  const { user } = useAuth();
  if (!user) return null;

  const mods = accessibleModules(user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {user.name} 👋</h1>
        <p className="text-sm text-neutral-400">
          Tienes acceso a {mods.length} módulo{mods.length === 1 ? '' : 's'}{' '}
          (rol {user.role}).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mods.map((m) => {
          const soon = m.status === 'soon';
          const inner = (
            <Card
              className={clsx(
                'h-full transition',
                soon
                  ? 'opacity-60'
                  : 'hover:border-brand/60 hover:bg-neutral-900',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{m.icon}</span>
                {soon && (
                  <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
                    PRÓXIMAMENTE
                  </span>
                )}
              </div>
              <div className="mt-3 font-semibold">{m.title}</div>
              <div className="mt-1 text-sm text-neutral-400">
                {m.description}
              </div>
            </Card>
          );
          return (
            <Link key={m.key} href={m.href}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
