'use client';

import { useState } from 'react';
import {
  MONTH_NAMES,
  birthdayError,
  birthdayLabel,
  formatRut,
  formatRutInput,
  isValidRut,
  normalizeInstagramHandle,
  placeLabel,
  publicName,
  regionName,
} from '@baile-latino/types';
import type { PublicUser } from '@baile-latino/types';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Select, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';
import { MyClasses } from '@/components/my-classes';
import {
  StylePreferencePicker,
  useSaveStylePreference,
} from '@/components/style-preference';

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

  const initial = publicName(user).trim().charAt(0).toUpperCase() || '👤';

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
          {initial}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{publicName(user)}</h1>
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
  const { save, saving, error } = useSaveStylePreference();
  return (
    <>
      <SectionHeader
        title="Perfil"
        desc="Tu información pública en la comunidad."
      />
      <Card className="space-y-2.5">
        <Field label="Nombre visible" value={publicName(user)} />
        <Field label="Nombre completo" value={[user.name, user.lastName].filter(Boolean).join(' ')} />
        <Field label="Comuna" value={[placeLabel(user.city, user.commune), user.region && regionName(user.region)].filter(Boolean).join(' · ') || '—'} />
        <Field
          label="Instagram"
          value={user.instagramHandle ? `@${user.instagramHandle}` : '—'}
        />
        <Field
          label="Estilos"
          value={user.styles?.length ? user.styles.join(', ') : '—'}
        />
      </Card>

      <SectionHeader
        title="Mis clases"
        desc="Las clases de academias en que estás inscrito o pediste inscripción."
      />
      <MyClasses />

      <SectionHeader
        title="Datos personales"
        desc="La comunidad ve tu nombre visible. Tu nombre completo y tu RUT solo los ves tú y la administración de NectaSon."
      />
      <PersonalDataForm user={user} />

      <SectionHeader
        title="Qué bailas"
        desc="Tu preferencia. Puedes cambiarla cuando quieras."
      />
      <Card>
        <StylePreferencePicker
          value={user.stylePreference}
          onPick={(v) => void save(v)}
          saving={saving}
        />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
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

/** Apellido y RUT (con validación del dígito verificador mientras se escribe). */
function PersonalDataForm({ user }: { user: PublicUser }) {
  const { updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [bDay, setBDay] = useState(user.birthDay ? String(user.birthDay) : '');
  const [bMonth, setBMonth] = useState(user.birthMonth ? String(user.birthMonth) : '');
  const [instagram, setInstagram] = useState(user.instagramHandle ? `@${user.instagramHandle}` : '');
  const [rut, setRut] = useState(user.rut ? formatRut(user.rut) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const rutFilled = rut.trim() !== '';
  const rutValid = !rutFilled || isValidRut(rut);
  // Mostrar el error solo cuando ya escribió algo con forma de RUT completo.
  const showRutError = rutFilled && !rutValid && rut.replace(/[^0-9kK]/g, '').length >= 8;
  const nameValid = name.trim().length >= 2;
  const num = (v: string) => (v ? Number(v) : null);
  const bdayErr = birthdayError(num(bDay), num(bMonth));
  const igFilled = instagram.trim() !== '';
  const igHandle = igFilled ? normalizeInstagramHandle(instagram) : null;
  const igValid = !igFilled || igHandle !== null;
  const dirty =
    name.trim() !== user.name ||
    displayName.trim() !== (user.displayName ?? '') ||
    lastName.trim() !== (user.lastName ?? '') ||
    num(bDay) !== user.birthDay ||
    num(bMonth) !== user.birthMonth ||
    (igHandle ?? (igFilled ? instagram : '')) !== (user.instagramHandle ?? '') ||
    (rutFilled ? rut : '') !== (user.rut ? formatRut(user.rut) : '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!rutValid) {
      setError('El RUT no es válido: revisa los números y el dígito verificador.');
      return;
    }
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const u = await api<PublicUser>('/auth/me/profile', {
        method: 'PATCH',
        body: {
          name: name.trim(),
          displayName: displayName.trim() || null,
          lastName: lastName.trim() || null,
          instagramHandle: igFilled ? instagram.trim() : null,
          birthDay: num(bDay),
          birthMonth: num(bMonth),
          rut: rut.trim() || null,
        },
      });
      updateUser(u);
      setName(u.name);
      setDisplayName(u.displayName ?? '');
      setInstagram(u.instagramHandle ? `@${u.instagramHandle}` : '');
      setBDay(u.birthDay ? String(u.birthDay) : '');
      setBMonth(u.birthMonth ? String(u.birthMonth) : '');
      setLastName(u.lastName ?? '');
      setRut(u.rut ? formatRut(u.rut) : '');
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">Nombre</span>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setOk(false);
              }}
              placeholder="María José"
              maxLength={80}
              required
              autoComplete="given-name"
              aria-invalid={!nameValid}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">Apellido</span>
            <Input
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setOk(false);
              }}
              placeholder="González Pérez"
              maxLength={80}
              autoComplete="family-name"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">Nombre visible (opcional)</span>
            <Input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setOk(false);
              }}
              placeholder={name.trim() || 'Ej: La Cote, DJ Mambo'}
              maxLength={40}
              autoComplete="nickname"
            />
            <span className="text-[11px] text-neutral-500">
              Tu pseudónimo: es lo que ve la comunidad. Si lo dejas vacío, se ve tu nombre.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">Instagram (opcional)</span>
            <Input
              value={instagram}
              onChange={(e) => {
                setInstagram(e.target.value);
                setOk(false);
                setError(null);
              }}
              placeholder="@tucuenta"
              maxLength={120}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!igValid}
              className={clsx(!igValid && 'border-red-500/70')}
            />
            <span className={clsx('text-[11px]', igValid ? 'text-neutral-500' : 'text-red-300')}>
              {igValid
                ? 'Tu @ o el link de tu perfil. Lo ve la comunidad.'
                : 'Solo letras, números, punto y guion bajo (máx. 30).'}
            </span>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">Cumpleaños (opcional)</span>
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <Select
                aria-label="Día"
                value={bDay}
                onChange={(e) => {
                  setBDay(e.target.value);
                  setOk(false);
                }}
              >
                <option value="">Día</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Mes"
                value={bMonth}
                onChange={(e) => {
                  setBMonth(e.target.value);
                  setOk(false);
                }}
              >
                <option value="">Mes</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <span className={clsx('text-[11px]', bdayErr ? 'text-red-300' : 'text-neutral-500')}>
              {bdayErr ??
                (bDay && bMonth
                  ? `🎂 ${birthdayLabel(Number(bDay), Number(bMonth))}. Solo lo ves tú y la administración.`
                  : 'Solo día y mes. Lo ves tú y la administración.')}
            </span>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-400">RUT</span>
            <Input
              value={rut}
              onChange={(e) => {
                setRut(formatRutInput(e.target.value));
                setOk(false);
                setError(null);
              }}
              placeholder="12.345.678-5"
              inputMode="text"
              maxLength={12}
              aria-invalid={showRutError}
              className={clsx(
                showRutError && 'border-red-500/70',
                rutFilled && rutValid && 'border-brand/70',
              )}
            />
            <span
              className={clsx(
                'text-[11px]',
                showRutError ? 'text-red-300' : rutFilled && rutValid ? 'text-brand' : 'text-neutral-500',
              )}
            >
              {showRutError
                ? 'El dígito verificador no calza.'
                : rutFilled && rutValid
                  ? '✓ RUT válido'
                  : 'Con dígito verificador (si es K, escríbela al final).'}
            </span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !dirty || !rutValid || !nameValid || !igValid || Boolean(bdayErr)}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
          {ok && <span className="text-sm text-brand">Guardado ✓</span>}
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>
      </form>
    </Card>
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
