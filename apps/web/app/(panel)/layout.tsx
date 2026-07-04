'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { USER_ROLES, type UserRole } from '@baile-latino/types';
import { useAuth } from '@/lib/auth';
import { Button, Card, Select, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';
import { moduleForPath, permKeyForPath, type ModuleChild } from '@/lib/modules';
import { usePermissions } from '@/lib/permissions';
import { PlayerProvider } from '@/components/player';
import { WhatsNew } from '@/components/whats-new';
import { BrandLogo, Wordmark } from '@/components/brand';
import { LayoutUIContext } from '@/lib/layout-ui';
import { ViewAsRoleContext } from '@/lib/view-as-role';

const VIEW_AS_KEY = 'nectason.viewAsRole';

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
  const [activeNavKey, setActiveNavKey] = useState<string | null>(null);
  const [viewAsRole, setViewAsRoleState] = useState<UserRole | null>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Persistencia del "Ver como rol" (solo aplica a super admin).
  useEffect(() => {
    if (!isSuperAdmin) return;
    const saved = localStorage.getItem(VIEW_AS_KEY);
    if (saved && USER_ROLES.includes(saved as UserRole)) {
      setViewAsRoleState(saved as UserRole);
    }
  }, [isSuperAdmin]);

  const setViewAsRole = (r: UserRole | null) => {
    setViewAsRoleState(r);
    if (r) localStorage.setItem(VIEW_AS_KEY, r);
    else localStorage.removeItem(VIEW_AS_KEY);
  };

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

  // Rol efectivo: si un super admin está "viendo como" otro rol, la navegación
  // y los bloqueos se calculan con ese rol (solo UI; el JWT sigue siendo super).
  const effectiveRole: UserRole =
    isSuperAdmin && viewAsRole ? viewAsRole : user.role;

  const myModules = perms.accessibleModules(effectiveRole);
  const activeModule = moduleForPath(pathname);
  // Bloquea por la sección específica de la ruta si existe; si no, por el módulo.
  const blockKey = permKeyForPath(pathname) ?? activeModule?.key;
  const blocked =
    activeModule && blockKey && !perms.can(effectiveRole, blockKey, 'ver');

  return (
    <ViewAsRoleContext.Provider value={{ viewAsRole, setViewAsRole }}>
    <LayoutUIContext.Provider
      value={{ collapsed, setCollapsed, activeNavKey, setActiveNavKey }}
    >
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
            'mb-6 flex font-bold',
            collapsed
              ? 'flex-col items-center gap-2'
              : 'items-center justify-between px-2',
          )}
        >
          {collapsed ? (
            <BrandLogo className="h-9 w-9" />
          ) : (
            <span className="flex items-center gap-2">
              <BrandLogo className="h-7 w-7" />
              <Wordmark className="text-lg" />
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expandir menú' : 'Comprimir menú'}
            aria-label={collapsed ? 'Expandir menú' : 'Comprimir menú'}
            className="rounded-md px-1.5 py-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
          >
            {collapsed ? '»' : '«'}
          </button>
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
                      if (!perms.can(effectiveRole, c.key, 'ver')) return null;
                      if (c.children) {
                        const visible = c.children.filter((g) =>
                          perms.can(effectiveRole, g.key, 'ver'),
                        );
                        if (visible.length === 0) return null;
                        return (
                          <div key={c.key} className="mt-1">
                            <div className="px-2 py-1 text-xs font-semibold text-neutral-500">
                              {c.label}
                            </div>
                            <div className="ml-2 flex flex-col gap-0.5 border-l border-neutral-800/60 pl-2">
                              {visible.map((g) => (
                                <SubNavLink
                                  key={g.key}
                                  child={g}
                                  pathname={pathname}
                                  activeNavKey={activeNavKey}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <SubNavLink
                          key={c.key}
                          child={c}
                          pathname={pathname}
                          activeNavKey={activeNavKey}
                        />
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
            {isSuperAdmin && (
              <ViewAsControl
                viewAsRole={viewAsRole}
                setViewAsRole={setViewAsRole}
              />
            )}
            <WhatsNew />
            <Link
              href="/profile"
              title={`Mi perfil — ${user.name}`}
              aria-label="Mi perfil"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              {user.name?.trim()?.charAt(0).toUpperCase() || '👤'}
            </Link>
            <Button variant="ghost" onClick={logout}>
              Salir
            </Button>
          </div>
        </header>

        {isSuperAdmin && viewAsRole && (
          <div className="flex items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-sm text-amber-200">
            <span>
              👁 Viendo la plataforma como <b>{viewAsRole}</b> — es solo una
              vista previa; tus permisos reales siguen intactos.
            </span>
            <button
              type="button"
              onClick={() => setViewAsRole(null)}
              className="rounded-md bg-amber-500/20 px-2 py-0.5 font-medium text-amber-100 transition hover:bg-amber-500/30"
            >
              Volver a Super Admin
            </button>
          </div>
        )}

        <main
          className="flex-1 overflow-auto p-6"
          style={{
            paddingBottom: 'calc(1.5rem + var(--player-bar-h, 0px))',
          }}
        >
          {blocked ? (
            <Card className="mx-auto mt-10 max-w-md text-center">
              <div className="mb-2 text-4xl">🚫</div>
              <h2 className="text-lg font-semibold">Sin acceso</h2>
              <p className="mt-1 text-sm text-neutral-400">
                {isSuperAdmin && viewAsRole ? (
                  <>
                    El rol <b>{viewAsRole}</b> (que estás previsualizando) no
                    tiene acceso al módulo {activeModule?.title}.
                  </>
                ) : (
                  <>
                    Tu rol ({user.role}) no tiene acceso al módulo{' '}
                    {activeModule?.title}.
                  </>
                )}
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
    </ViewAsRoleContext.Provider>
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

/** Selector para que el super admin previsualice la app como otro rol. */
function ViewAsControl({
  viewAsRole,
  setViewAsRole,
}: {
  viewAsRole: UserRole | null;
  setViewAsRole: (r: UserRole | null) => void;
}) {
  return (
    <label className="flex items-center gap-1.5" title="Ver la plataforma como otro rol (solo vista previa)">
      <span className="hidden text-neutral-500 sm:inline">👁 Ver como</span>
      <Select
        value={viewAsRole ?? ''}
        onChange={(e) =>
          setViewAsRole(e.target.value ? (e.target.value as UserRole) : null)
        }
        className={clsx(
          'py-1 text-xs',
          viewAsRole && 'border-amber-500/50 text-amber-200',
        )}
      >
        <option value="">Super Admin (yo)</option>
        {USER_ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
    </label>
  );
}

function SubNavLink({
  child,
  pathname,
  activeNavKey,
}: {
  child: ModuleChild;
  pathname: string;
  activeNavKey: string | null;
}) {
  if (!child.href) return null;
  // Activo por ruta exacta, o porque la página marcó esta subsección (para
  // rutas compartidas como el detalle de playlist).
  const active = pathname === child.href || activeNavKey === child.key;
  return (
    <Link
      href={child.href}
      className={clsx(
        'rounded-md px-2 py-1 text-sm transition',
        active ? 'text-brand' : 'text-neutral-400 hover:text-neutral-200',
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
