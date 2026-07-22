'use client';

import { useAuth } from '@/lib/auth';
import {
  StylePreferencePicker,
  useSaveStylePreference,
} from './style-preference';

/**
 * Se muestra la primera vez que alguien entra (cuando todavía no eligió su
 * preferencia de baile). No se puede cerrar sin elegir: son tres opciones y una
 * es "me da igual", así que siempre hay una respuesta válida. Después se puede
 * cambiar desde Perfil.
 */
export function StylePreferenceModal() {
  const { user } = useAuth();
  const { save, saving, error } = useSaveStylePreference();

  if (!user || user.stylePreference !== null) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl">
        <h2 className="text-xl font-bold">
          ¡Bienvenido/a{user.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          ¿Qué bailas más? Lo usamos para mostrarte lo que te interesa. Puedes
          cambiarlo cuando quieras desde tu perfil.
        </p>

        <div className="mt-5">
          <StylePreferencePicker
            value={null}
            onPick={(v) => void save(v)}
            saving={saving}
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
