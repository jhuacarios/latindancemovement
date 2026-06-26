'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, Card, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';
import { moduleForPath, permKeyForPath, type ModuleChild } from '@/lib/modules';
import { usePermissions } from '@/lib/permissions';
import { PlayerProvider } from '@/components/player';
import { WhatsNew } from '@/components/whats-new';
import { LayoutUIContext } from '@/lib/layout-ui';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const perms = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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

  const myModules = perms.accessibleModules(user.role);
  const activeModule = moduleForPath(pathname);
  // Bloquea por la sección específica de la ruta si existe; si no, por el módulo.
  const blockKey = permKeyForPath(pathname) ?? activeModule?.key;
  const blocked =
    activeModule && blockKey && !perms.can(user.role, blockKey, 'ver');

  return (
    <LayoutUIContext.Provider value={{ collapsed, setCollapsed }}>
    <PlayerProvider>
    <div className="flex min-h-screen">
      <aside
        className={clsx(
          'flex shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40 transition-all',
          collapsed ? 'w-16 p-2' : 'w-64 p-4',
        )}
      >
        <div
          className={clsx(
            'mb-6 font-bold',
            collapsed ? 'text-center text-lg' : 'px-2 text-lg',
          )}
        >
          {collapsed ? (
            <span className="text-brand">BL</span>
          ) : (
            <>
              Baile<span className="text-brand">Latino</span>
            </>
          )}
        </div>

        {collapsed ? (
          <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
            <IconLink href="/" icon="🏠" title="Inicio" active={pathname === '/'} />
            {myModules.map((m) => (
              <IconLink
                key={m.key}
                href={m.href}
                icon={m.icon}
                title={m.title}
                active={
                  pathname === m.href || pathname.startsWith(`${m.href}/`)
                }
              />
            ))}
          </nav>
        ) : (
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavLink href="/" label="🏠 Inicio" active={pathname === '/'} />

          <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Módulos
          </div>

          {myModules.map((m) => {
            const isActive =
              pathname === m.href || pathname.startsWith(`${m.href}/`);
            return (
              <div key={m.key}>
                <Link
                  href={m.href}
                  className={clsx(
                    'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition',
                    isActive
                      ? 'bg-brand/15 text-brand'
                      : 'text-neutral-300 hover:bg-neutral-800',
                  )}
                >
                  <span>
                    {m.icon} {m.title}
                  </span>
                  {m.status === 'soon' && (
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      pronto
                    </span>
                  )}
                </Link>

                {isActive && m.children && (
                  <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-neutral-800 pl-3">
                    {m.children.map((c) => {
                      if (!perms.can(user.role, c.key, 'ver')) return null;
                      if (c.children) {
                        const visible = c.children.filter((g) =>
                          perms.can(user.role, g.key, 'ver'),
                        );
                        if (visible.length === 0) return null;
                        return (
                          <div key={c.key} className="mt-1">
                            <div className="px-2 py-1 text-xs font-semibold text-neutral-500">
                              {c.label}
                            </div>
                            <div className="ml-2 flex flex-col gap-0.5 border-l border-neutral-800/60 pl-2">
                              {visible.map((g) => (
                                <SubNavLink key={g.key} child={g} pathname={pathname} />
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <SubNavLink key={c.key} child={c} pathname={pathname} />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
          <div className="text-sm text-neutral-400">
            {activeModule ? `${activeModule.icon} ${activeModule.title}` : 'Panel'}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <WhatsNew />
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

        <main className="flex-1 overflow-auto p-6">
          {blocked ? (
            <Card className="mx-auto mt-10 max-w-md text-center">
              <div className="mb-2 text-4xl">🚫</div>
              <h2 className="text-lg font-semibold">Sin acceso</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Tu rol ({user.role}) no tiene acceso al módulo{' '}
                {activeModule?.title}.
              </p>
              <Link
                href="/"
                className="mt-4 inline-block text-sm text-brand hover:underline"
              >
                ← Volver al inicio
              </Link>
            </Card>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
    </PlayerProvider>
    </LayoutUIContext.Provider>
  );
}

function IconLink({
  href,
  icon,
  title,
  active,
}: {
  href: string;
  icon: string;
  title: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={clsx(
        'flex h-10 w-10 items-center justify-center rounded-lg text-lg transition',
        active ? 'bg-brand/15' : 'text-neutral-300 hover:bg-neutral-800',
      )}
    >
      {icon}
    </Link>
  );
}

function SubNavLink({
  child,
  pathname,
}: {
  child: ModuleChild;
  pathname: string;
}) {
  if (!child.href) return null;
  return (
    <Link
      href={child.href}
      className={clsx(
        'rounded-md px-2 py-1 text-sm transition',
        pathname === child.href
          ? 'text-brand'
          : 'text-neutral-400 hover:text-neutral-200',
      )}
    >
      {child.label}
    </Link>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        'rounded-lg px-3 py-2 text-sm transition',
        active ? 'bg-brand/15 text-brand' : 'text-neutral-300 hover:bg-neutral-800',
      )}
    >
      {label}
    </Link>
  );
}
