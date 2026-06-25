'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import {
  RELEASE_NOTES,
  type ReleaseNoteType,
} from '@/lib/release-notes';

const TYPE_META: Record<ReleaseNoteType, { label: string; cls: string }> = {
  feature: { label: 'Nuevo', cls: 'bg-brand/15 text-brand' },
  improvement: { label: 'Mejora', cls: 'bg-sky-500/15 text-sky-300' },
  fix: { label: 'Fix', cls: 'bg-amber-500/15 text-amber-300' },
};

/**
 * "Novedades": campanita con badge de no-leídas. Muestra las mejoras/correcciones
 * filtradas por los módulos que el usuario puede ver. El "ya visto" se guarda por
 * usuario en localStorage.
 */
export function WhatsNew() {
  const { user } = useAuth();
  const perms = usePermissions();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  const storageKey = user ? `bl_seen_release:${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    setLastSeen(localStorage.getItem(storageKey) ?? '');
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;

  // Solo las novedades de módulos que este usuario puede ver (o 'general').
  const visible = RELEASE_NOTES.filter(
    (n) => n.module === 'general' || perms.can(user.role, n.module, 'ver'),
  );
  const unseen = visible.filter((n) => n.date > lastSeen);

  function markSeen() {
    if (!storageKey || visible.length === 0) return;
    const latest = visible.reduce((m, n) => (n.date > m ? n.date : m), '');
    localStorage.setItem(storageKey, latest);
    setLastSeen(latest);
  }

  function toggle() {
    setOpen((o) => {
      if (!o) markSeen();
      return !o;
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        title="Novedades"
        className="relative rounded-lg px-2 py-1 text-neutral-300 transition hover:bg-neutral-800"
      >
        🔔
        {unseen.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
            {unseen.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-80 overflow-auto rounded-xl border border-neutral-800 bg-neutral-900 p-3 shadow-xl">
          <div className="mb-2 text-sm font-semibold">Novedades</div>
          {visible.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No hay novedades para tus módulos por ahora.
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map((n, i) => (
                <div
                  key={`${n.version}-${i}`}
                  className="rounded-lg bg-neutral-800/40 p-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${TYPE_META[n.type].cls}`}
                    >
                      {TYPE_META[n.type].label}
                    </span>
                    <span className="text-xs font-medium">{n.title}</span>
                  </div>
                  {n.description && (
                    <p className="mt-1 text-xs text-neutral-400">
                      {n.description}
                    </p>
                  )}
                  <div className="mt-1 text-[10px] text-neutral-600">
                    v{n.version} · {n.date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
