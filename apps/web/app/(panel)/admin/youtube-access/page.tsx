'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  YoutubeAccessRequest,
  YoutubeAccessStatus,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';

const STATUS_META: Record<
  YoutubeAccessStatus,
  { label: string; cls: string }
> = {
  PENDING: { label: '⏳ Pendiente', cls: 'bg-amber-500/15 text-amber-300' },
  ADDED: { label: '✅ Agregado', cls: 'bg-emerald-500/15 text-emerald-300' },
  REJECTED: { label: '✕ Rechazado', cls: 'bg-red-500/15 text-red-300' },
};

export default function AdminYoutubeAccessPage() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['admin-youtube-access'],
    queryFn: () =>
      api<YoutubeAccessRequest[]>('/music/youtube/access-requests'),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: YoutubeAccessStatus }) =>
      api<YoutubeAccessRequest>(`/music/youtube/access-requests/${id}`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin-youtube-access'] }),
  });

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      setTimeout(() => setCopied((c) => (c === email ? null : c)), 1500);
    } catch {
      /* sin portapapeles: el admin lo copia a mano */
    }
  }

  const rows = list.data ?? [];
  const pending = rows.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Accesos de YouTube</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Solicitudes de usuarios para conectar su YouTube. Copia el correo,
          agrégalo como <b>test user</b> en Google Cloud (proyecto{' '}
          <code className="text-neutral-300">social-beats-dj</code> → Audience →
          Test users) y marca la solicitud como <b>Agregado</b>.
        </p>
      </div>

      {list.isLoading && <Spinner label="Cargando solicitudes…" />}
      {list.isError && (
        <Card className="text-sm text-red-300">
          {list.error instanceof ApiError
            ? list.error.message
            : 'No se pudieron cargar las solicitudes.'}
        </Card>
      )}

      {list.data && rows.length === 0 && (
        <Card className="text-sm text-neutral-500">
          No hay solicitudes por ahora.
        </Card>
      )}

      {rows.length > 0 && (
        <>
          {pending > 0 && (
            <p className="text-sm text-amber-300">
              {pending} pendiente{pending === 1 ? '' : 's'} por revisar.
            </p>
          )}
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 text-left text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Correo a agregar</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-neutral-800/60 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.userName ?? '—'}</div>
                      <div className="text-xs text-neutral-500">
                        {r.userLoginEmail}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => copy(r.email)}
                        title="Copiar correo"
                        className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-200 transition hover:bg-neutral-700"
                      >
                        {r.email}
                        <span className="text-neutral-400">
                          {copied === r.email ? '✓' : '⧉'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-xs',
                          STATUS_META[r.status].cls,
                        )}
                      >
                        {STATUS_META[r.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {r.status !== 'ADDED' && (
                          <Button
                            size="sm"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({ id: r.id, status: 'ADDED' })
                            }
                          >
                            Marcar agregado
                          </Button>
                        )}
                        {r.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({ id: r.id, status: 'REJECTED' })
                            }
                          >
                            Rechazar
                          </Button>
                        )}
                        {r.status !== 'PENDING' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({ id: r.id, status: 'PENDING' })
                            }
                          >
                            Reabrir
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
