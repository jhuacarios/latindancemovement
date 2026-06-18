'use client';

import { useQuery } from '@tanstack/react-query';
import type { CatalogSummary, TopTrack } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Card, Spinner, StyleBadge } from '@/components/ui';

export default function ReportsPage() {
  const catalog = useQuery({
    queryKey: ['catalog-summary'],
    queryFn: () => api<CatalogSummary>('/music/reports/catalog'),
  });
  const top = useQuery({
    queryKey: ['top-requested'],
    queryFn: () => api<TopTrack[]>('/music/reports/top-requested?limit=10'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-sm text-neutral-400">Estado del catálogo y demanda.</p>
      </div>

      {catalog.isLoading && <Spinner />}
      {catalog.data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Breakdown title="Por estilo" map={catalog.data.byStyle} />
          <Breakdown title="Por sub-estilo" map={catalog.data.bySubstyle} />
          <Breakdown title="Por fuente" map={catalog.data.bySource} />
          <Breakdown title="Por estado" map={catalog.data.byApprovalStatus} />
        </div>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Más solicitadas</h2>
        {top.isLoading && <Spinner />}
        {top.data && top.data.length === 0 && (
          <p className="text-sm text-neutral-500">
            Aún no hay solicitudes registradas (llegan desde la app de la comunidad).
          </p>
        )}
        <ol className="space-y-2">
          {top.data?.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <span className="w-6 text-right text-neutral-500">{i + 1}.</span>
              <StyleBadge style={t.style} />
              <span className="font-medium">{t.title}</span>
              <span className="text-neutral-500">— {t.artist}</span>
              <span className="ml-auto text-neutral-400">
                {t.requestCount} solicitudes
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Breakdown({
  title,
  map,
}: {
  title: string;
  map: Record<string, number>;
}) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <Card>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-sm text-neutral-500">Sin datos.</p>
        )}
        {entries.map(([k, v]) => (
          <div key={k}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-neutral-300">{k}</span>
              <span className="text-neutral-400">{v}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-brand"
                style={{ width: `${(v / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
