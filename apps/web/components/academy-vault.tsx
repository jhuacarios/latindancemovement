'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AcademyDto, AcademyVideoDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { academiesApi, formatBytes, formatVideoDuration, missingExtension } from '@/lib/academies';
import { ConfirmDialog, type ConfirmOptions } from './confirm-dialog';
import { Button, Card, Spinner } from './ui';
import { clsx } from './clsx';

/** Descarga el original: la URL firmada trae "attachment", así que el navegador lo baja sin salir de la página. */
export async function downloadMedia(academyId: string, videoId: string): Promise<void> {
  const { url } = await academiesApi.downloadUrl(academyId, videoId);
  window.location.href = url;
}

export function StorageBar({ label, used, quota }: { label: string; used: number; quota: number }) {
  const pct = Math.min(100, (used / Math.max(1, quota)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span>
          {formatBytes(used)} de {formatBytes(quota)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
        <div className={clsx('h-full', pct > 90 ? 'bg-amber-500' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Bóveda de la academia (solo dueño y profesores): archivos guardados en
 * almacenamiento barato (R2 Infrequent Access). No se ven ni se reproducen en la
 * galería y no ocupan su espacio; se descargan o se devuelven a la galería.
 */
export function AcademyVault({ a, onChanged }: { a: AcademyDto; onChanged: () => void }) {
  const q = useQuery({ queryKey: ['academies', 'vault', a.id], queryFn: () => academiesApi.vault(a.id) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const items = q.data ?? [];

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const restore = async (ids: string[]) => {
    setBusy('restore');
    setError(null);
    try {
      await academiesApi.fromVault(a.id, ids);
      setSelected(new Set());
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo devolver a la galería.');
    } finally {
      setBusy(null);
    }
  };

  const download = async (v: AcademyVideoDto) => {
    setBusy(v.id);
    setError(null);
    try {
      await downloadMedia(a.id, v.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo descargar.');
    } finally {
      setBusy(null);
    }
  };

  const remove = (v: AcademyVideoDto) =>
    setConfirm({
      title: 'Eliminar de la bóveda',
      message: `¿Eliminar "${v.title}"? Se borra el original y no se puede recuperar.`,
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: async () => {
        await academiesApi.removeVideo(a.id, v.id);
        onChanged();
      },
    });

  const selectedBytes = items.filter((v) => selected.has(v.id)).reduce((s, v) => s + v.sizeBytes, 0);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">🗄️ Bóveda</h2>
          <p className="text-sm text-neutral-400">
            Guarda aquí los originales que ya no necesitas mostrar: no ocupan el espacio de la galería y quedan seguros en
            almacenamiento de largo plazo. No se ven ni se reproducen; se <strong>descargan</strong> cuando los necesites
            (al instante) o se devuelven a la galería. Para mover algo a la bóveda, selecciónalo en la pestaña Fotos y
            videos.
          </p>
        </div>
        {a.storage && (
          <div className="grid gap-3 sm:grid-cols-2">
            <StorageBar label="Bóveda" used={a.storage.vaultUsedBytes} quota={a.storage.vaultQuotaBytes} />
            <StorageBar label="Galería" used={a.storage.usedBytes} quota={a.storage.quotaBytes} />
          </div>
        )}
      </Card>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-neutral-900 p-3 text-sm shadow-lg">
          <span>
            {selected.size} {selected.size === 1 ? 'archivo seleccionado' : 'archivos seleccionados'} ({formatBytes(selectedBytes)})
          </span>
          <Button size="sm" onClick={() => restore([...selected])} disabled={busy !== null}>
            {busy === 'restore' ? 'Devolviendo…' : 'Devolver a la galería'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={busy !== null}>
            Cancelar
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {q.isLoading && <Spinner label="Cargando bóveda…" />}
      {q.data && items.length === 0 && (
        <Card className="text-sm text-neutral-400">La bóveda está vacía.</Card>
      )}
      <ul className="space-y-2">
        {items.map((v) => (
          <li
            key={v.id}
            className={clsx(
              'flex items-center gap-3 rounded-xl border bg-neutral-900/60 p-2',
              selected.has(v.id) ? 'border-brand/60' : 'border-neutral-800',
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(v.id)}
              onChange={() => toggle(v.id)}
              className="ml-1 h-4 w-4 accent-brand"
              aria-label={`Seleccionar ${v.title}`}
            />
            <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
              {v.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbUrl} alt="" className="h-full w-full object-cover opacity-80" loading="lazy" />
              ) : (
                <span className="flex h-full items-center justify-center text-xl">{v.kind === 'PHOTO' ? '🖼️' : '🎬'}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {v.title}
                <span className="text-neutral-500">{missingExtension(v)}</span>
              </div>
              <div className="text-xs text-neutral-500">
                {[
                  formatBytes(v.sizeBytes),
                  formatVideoDuration(v.durationMs),
                  v.classTitle,
                  v.vaultedAt ? `en la bóveda desde el ${new Date(v.vaultedAt).toLocaleDateString('es-CL')}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 text-xs">
              <Button size="sm" variant="ghost" onClick={() => download(v)} disabled={busy !== null}>
                {busy === v.id ? 'Preparando…' : '⬇ Descargar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => restore([v.id])} disabled={busy !== null}>
                A la galería
              </Button>
              <button type="button" onClick={() => remove(v)} className="px-1 text-red-400/80 hover:text-red-300">
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
