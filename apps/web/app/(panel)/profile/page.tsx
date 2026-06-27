'use client';

import { useState } from 'react';
import type { PublicUser } from '@baile-latino/types';
import { useAuth } from '@/lib/auth';
import { Button, Card, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';

const SECTIONS = [
  { key: 'perfil', label: '👤 Perfil' },
  { key: 'cuenta', label: '🔐 Cuenta y seguridad' },
  { key: 'notificaciones', label: '🔔 Notificaciones' },
  { key: 'privacidad', label: '🛡️ Privacidad' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

export default function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const [section, setSection] = useState<SectionKey>('perfil');

  if (loading || !user) return <Spinner />;

  const initial = user.name?.trim()?.charAt(0).toUpperCase() || '👤';

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
          {initial}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <span className="mt-1 inline-block rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
            {user.role}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        {/* Sub-menú del perfil (dentro del panel) */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-56 md:flex-col">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={clsx(
                'whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition',
                section === s.key
                  ? 'bg-brand/15 text-brand'
                  : 'text-neutral-300 hover:bg-neutral-800',
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={logout}
            className="mt-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/10"
          >
            ↩ Cerrar sesión
          </button>
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {section === 'perfil' && <PerfilSection user={user} />}
          {section === 'cuenta' && <CuentaSection user={user} />}
          {section === 'notificaciones' && <SoonSection title="Notificaciones" desc="Próximamente: elige qué notificaciones recibir (novedades de la app, eventos, mensajes)." />}
          {section === 'privacidad' && <SoonSection title="Privacidad" desc="Próximamente: visibilidad de tu perfil, datos y permisos." />}
        </div>
      </div>
    </div>
  );
}

function PerfilSection({ user }: { user: PublicUser }) {
  return (
    <>
      <SectionHeader
        title="Perfil"
        desc="Tu información pública en la comunidad."
      />
      <Card className="space-y-2.5">
        <Field label="Nombre" value={user.name} />
        <Field label="Ciudad" value={user.city || '—'} />
        <Field
          label="Instagram"
          value={user.instagramHandle ? `@${user.instagramHandle}` : '—'}
        />
        <Field
          label="Estilos"
          value={user.styles?.length ? user.styles.join(', ') : '—'}
        />
      </Card>
      <p className="text-xs text-neutral-500">
        ✏️ La edición de perfil (foto, bio, estilos) llega pronto.
      </p>
    </>
  );
}

function CuentaSection({ user }: { user: PublicUser }) {
  return (
    <>
      <SectionHeader title="Cuenta y seguridad" desc="Tu acceso y cuentas vinculadas." />
      <Card className="space-y-2.5">
        <Field label="Email" value={user.email} />
        <Field label="Rol" value={user.role} />
        {user.hasPassword ? (
          <Field label="Contraseña" value="•••••••• · cambiar (próximamente)" />
        ) : (
          <Field label="Acceso" value="Con Google (sin contraseña)" />
        )}
        {user.hasGoogle && <Field label="Google" value="Conectado ✓" />}
      </Card>
      <p className="text-xs text-neutral-500">
        🔗 La conexión de tu cuenta de YouTube se gestiona en Música y DJs →
        Playlists YouTube.
      </p>
    </>
  );
}

function SoonSection({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <SectionHeader title={title} desc={desc} />
      <Card className="text-sm text-neutral-500">
        🚧 En construcción.
      </Card>
    </>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-neutral-400">{desc}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-neutral-800/60 pb-2.5 text-sm last:border-0 last:pb-0">
      <span className="text-neutral-400">{label}</span>
      <span className="truncate text-neutral-200">{value}</span>
    </div>
  );
}
