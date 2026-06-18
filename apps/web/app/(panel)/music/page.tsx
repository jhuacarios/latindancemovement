'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { CatalogSummary } from '@baile-latino/types';
import { api } from '@/lib/api';
import { Card, Spinner } from '@/components/ui';

export default function MusicHomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['catalog-summary'],
    queryFn: () => api<CatalogSummary>('/music/reports/catalog'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🎧 Música y DJs</h1>
        <p className="text-sm text-neutral-400">Resumen del catálogo.</p>
      </div>

      {isLoading && <Spinner />}
      {error && (
        <p className="text-sm text-red-300">No se pudo cargar el resumen.</p>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Canciones" value={data.totalTracks} />
          <Stat label="Bachata" value={data.byStyle.BACHATA ?? 0} accent="amber" />
          <Stat label="Salsa" value={data.byStyle.SALSA ?? 0} accent="red" />
          <Stat label="Novedades" value={data.releases} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <NavCard href="/music/tracks" title="Canciones" desc="Catálogo, alta por link y export a Excel." />
        <NavCard href="/music/playlists" title="Playlists" desc="Arma listas y usa el generador automático." />
        <NavCard href="/music/reports" title="Reportes" desc="Resumen del catálogo y más solicitadas." />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'amber' | 'red';
}) {
  const color =
    accent === 'amber'
      ? 'text-amber-300'
      : accent === 'red'
        ? 'text-red-300'
        : 'text-brand';
  return (
    <Card>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-sm text-neutral-400">{label}</div>
    </Card>
  );
}

function NavCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition hover:border-brand/60">
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm text-neutral-400">{desc}</div>
      </Card>
    </Link>
  );
}
