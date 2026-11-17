'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademyClassDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { WEEKDAYS, academiesApi, shareUrl } from '@/lib/academies';
import { Button, Input, Spinner } from './ui';

/**
 * Link para compartir las fotos y videos de una clase con personas externas
 * (sin cuenta pueden verlos y descargarlos). Una clase tiene un link activo; se
 * puede cambiar (el anterior deja de funcionar) o desactivar.
 */
export function AcademyShareModal({
  academyId,
  cls,
  onClose,
}: {
  academyId: string;
  cls: AcademyClassDto;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const key = ['academies', 'share', cls.id];
  const q = useQuery({ queryKey: key, queryFn: () => academiesApi.getShare(academyId, cls.id) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = q.data ? shareUrl(q.data.token) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">🔗 Compartir videos de la clase</h2>
          <p className="text-sm text-neutral-400">
            {cls.title} · {WEEKDAYS[cls.weekday]} {cls.startTime}
          </p>
        </div>
        <p className="text-sm text-neutral-300">
          Cualquier persona con este link puede <strong>ver y descargar</strong> las fotos y videos de esta clase, sin
          tener cuenta. Lo que subas después a la clase también aparece. Lo que está en la bóveda no se comparte.
        </p>

        {q.isLoading && <Spinner />}
        {q.data === null && (
          <Button onClick={() => run(() => academiesApi.createShare(academyId, cls.id))} disabled={busy}>
            {busy ? 'Creando…' : 'Crear link'}
          </Button>
        )}
        {link && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
              <Button onClick={copy} size="sm">
                {copied ? '✓ Copiado' : 'Copiar'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <a href={link} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                Abrir el link ↗
              </a>
              <span className="text-neutral-600">·</span>
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-200"
                disabled={busy}
                onClick={() => run(() => academiesApi.createShare(academyId, cls.id))}
                title="El link actual deja de funcionar"
              >
                Cambiar link
              </button>
              <span className="text-neutral-600">·</span>
              <button
                type="button"
                className="text-red-400/80 hover:text-red-300"
                disabled={busy}
                onClick={() => run(() => academiesApi.revokeShare(academyId, cls.id))}
              >
                Desactivar
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              Creado por {q.data?.createdByName} el {new Date(q.data!.createdAt).toLocaleDateString('es-CL')}. Si lo
              cambias o desactivas, el link anterior deja de funcionar.
            </p>
          </div>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <p className="text-xs text-amber-300/80">
          Comparte solo material donde las personas que aparecen estén de acuerdo en que lo vean personas fuera de la
          academia.
        </p>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
