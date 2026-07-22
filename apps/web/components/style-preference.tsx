'use client';

import { useState } from 'react';
import type { PublicUser, StylePreference } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { clsx } from './clsx';

/** Las tres opciones, con el mismo color que usa cada estilo en la app. */
export const PREFERENCE_OPTIONS: {
  value: StylePreference;
  label: string;
  hint: string;
  icon: string;
  active: string;
}[] = [
  {
    value: 'BACHATA',
    label: 'Bachata',
    hint: 'Sobre todo bachata',
    icon: '💃',
    active: 'border-amber-500 bg-amber-500/15 text-amber-300',
  },
  {
    value: 'SALSA',
    label: 'Salsa',
    hint: 'Sobre todo salsa',
    icon: '🕺',
    active: 'border-red-500 bg-red-500/15 text-red-300',
  },
  {
    value: 'AMBOS',
    label: 'Me da igual',
    hint: 'Bailo las dos',
    icon: '✨',
    active: 'border-brand bg-brand/15 text-brand',
  },
];

/**
 * Guarda la preferencia en la API y refresca el usuario en memoria.
 * Devuelve el estado para que quien lo use muestre "guardando" y errores.
 */
export function useSaveStylePreference() {
  const { updateUser } = useAuth();
  const [saving, setSaving] = useState<StylePreference | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: StylePreference): Promise<boolean> => {
    setSaving(value);
    setError(null);
    try {
      const user = await api<PublicUser>('/auth/me/style-preference', {
        method: 'PATCH',
        body: { stylePreference: value },
      });
      updateUser(user);
      return true;
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'No se pudo guardar tu preferencia.',
      );
      return false;
    } finally {
      setSaving(null);
    }
  };

  return { save, saving, error };
}

/** Selector de preferencia (tres tarjetas). Se usa en el modal y en el perfil. */
export function StylePreferencePicker({
  value,
  onPick,
  saving,
}: {
  value: StylePreference | null;
  onPick: (value: StylePreference) => void;
  saving?: StylePreference | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PREFERENCE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={Boolean(saving)}
          onClick={() => onPick(o.value)}
          className={clsx(
            'rounded-xl border px-2 py-3 text-center transition disabled:opacity-60',
            value === o.value
              ? o.active
              : 'border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:bg-neutral-800',
          )}
        >
          <div className="text-xl">{saving === o.value ? '⏳' : o.icon}</div>
          <div className="mt-1 text-sm font-semibold">{o.label}</div>
          <div className="text-[11px] text-neutral-500">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}
