'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademyVideoReportDto } from '@baile-latino/types';
import { academiesApi } from '@/lib/academies';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { Button, Card, Spinner } from '@/components/ui';

/** Reportes de videos de academias (derecho de imagen, contenido inapropiado…). */
export default function AdminVideoReportsPage() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const q = useQuery({ queryKey: ['academies', 'reports'], queryFn: academiesApi.reports });
  const refresh = () => qc.invalidateQueries({ queryKey: ['academies'] });

  const removeVideo = (r: AcademyVideoReportDto) =>
    setConfirm({
      title: 'Quitar archivo',
      message: `¿Borrar "${r.videoTitle}" de ${r.academyName}? Se elimina el archivo y no se puede recuperar.`,
      confirmLabel: 'Quitar',
      danger: true,
      onConfirm: async () => {
        await academiesApi.removeVideo(r.academyId, r.videoId);
        refresh();
      },
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reportes de fotos y videos</h1>
        <p className="text-sm text-neutral-400">
          Fotos y videos de academias que algún usuario reportó. Revísalo y quítalo, o marca el reporte como revisado si está
          bien.
        </p>
      </div>
      {q.isLoading && <Spinner />}
      {q.data && q.data.length === 0 && <Card className="text-sm text-neutral-400">No hay reportes pendientes.</Card>}
      <div className="space-y-3">
        {q.data?.map((r) => (
          <Card key={r.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-semibold">{r.videoTitle}</span>{' '}
                <span className="text-sm text-neutral-400">
                  en{' '}
                  <Link href={`/academies/${r.academyId}`} className="text-brand hover:underline">
                    {r.academyName}
                  </Link>
                </span>
              </div>
              <span className="text-xs text-neutral-500">
                {new Date(r.createdAt).toLocaleString('es-CL')} · {r.reporterName}
              </span>
            </div>
            <p className="whitespace-pre-line text-sm text-neutral-300">“{r.reason}”</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="danger" onClick={() => removeVideo(r)}>
                Quitar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await academiesApi.resolveReport(r.id);
                  refresh();
                }}
              >
                Está bien, marcar revisado
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
