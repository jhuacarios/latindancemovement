'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StorageBucketDto,
  StorageLimits,
  StorageReportDto,
  StorageTableDto,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';

const GB = 1024 ** 3;
const KEY = ['admin', 'storage'] as const;

/** 1.234.567 bytes → "1,2 MB". */
function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('es-CL', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

type Level = 'ok' | 'warn' | 'critical';
function levelOf(pct: number): Level {
  if (pct >= 90) return 'critical';
  if (pct >= 70) return 'warn';
  return 'ok';
}
const LEVEL_TEXT: Record<Level, string> = {
  ok: 'Holgado',
  warn: '⚠ Acercándose al límite',
  critical: '⛔ Al límite: libera espacio o sube el plan',
};

/** Medidor de uso contra un límite. El estado va con texto, no solo color. */
function Meter({ used, limit, caption }: { used: number; limit: number; caption: string }) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  const level = levelOf(pct);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold text-neutral-100">{formatBytes(used)}</span>
        <span className="text-sm text-neutral-400">
          de {formatBytes(limit)} · {pct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-800"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={caption}
      >
        <div
          className={clsx(
            'h-full rounded-full',
            level === 'ok' && 'bg-brand',
            level === 'warn' && 'bg-amber-400',
            level === 'critical' && 'bg-red-500',
          )}
          style={{ width: `${Math.min(100, Math.max(pct, used > 0 ? 1 : 0))}%` }}
        />
      </div>
      <div
        className={clsx(
          'text-xs',
          level === 'ok' && 'text-neutral-500',
          level === 'warn' && 'text-amber-300',
          level === 'critical' && 'text-red-300',
        )}
      >
        {LEVEL_TEXT[level]} · {caption}
      </div>
    </div>
  );
}

/** Tabla de desglose con una barra delgada de magnitud (un solo tono). */
function Breakdown({
  rows,
  total,
}: {
  rows: { label: string; detail: string; bytes: number }[];
  total: number;
}) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-neutral-800 first:border-0">
            <td className="py-2 pr-3">
              <div className="text-neutral-200">{r.label}</div>
              <div className="text-xs text-neutral-500">{r.detail}</div>
            </td>
            <td className="w-1/3 py-2 pr-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-neutral-400"
                  style={{ width: `${total > 0 ? Math.max(1, (r.bytes / total) * 100) : 0}%` }}
                />
              </div>
            </td>
            <td className="whitespace-nowrap py-2 text-right tabular-nums text-neutral-300">
              {formatBytes(r.bytes)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BucketCard({ b, limits }: { b: StorageBucketDto; limits: StorageLimits }) {
  return (
    <Card className="space-y-3">
      <div>
        <h3 className="font-semibold">{b.label}</h3>
        <p className="text-xs text-neutral-500">
          {b.configured ? `Bucket ${b.bucket}` : 'No configurado en este entorno'}
        </p>
      </div>
      {!b.configured ? (
        <p className="text-sm text-neutral-400">
          Falta configurar el bucket ({b.key === 'studio' ? 'S3_BUCKET' : 'S3_MEDIA_BUCKET'}).
        </p>
      ) : b.error ? (
        <p className="text-sm text-red-300">{b.error}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-2xl font-bold text-neutral-100">{formatBytes(b.totalBytes)}</span>
            </span>
            <span className="self-end text-neutral-400">
              {b.objectCount.toLocaleString('es-CL')} archivos
              {b.truncated && ' (listado cortado: el total es un mínimo)'}
            </span>
          </div>
          {b.infrequentBytes > 0 && (
            <p className="text-xs text-neutral-500">
              {formatBytes(b.standardBytes)} en Standard · {formatBytes(b.infrequentBytes)} en la
              bóveda (Infrequent Access)
            </p>
          )}
          {b.groups.length > 0 ? (
            <Breakdown
              total={b.totalBytes}
              rows={b.groups.map((g) => ({
                label: g.label,
                detail: `${g.count.toLocaleString('es-CL')} archivos`,
                bytes: g.bytes,
              }))}
            />
          ) : (
            <p className="text-sm text-neutral-500">Vacío.</p>
          )}
          <p className="text-[11px] text-neutral-500">
            Cuenta para el límite de R2 ({limits.r2Gb} GB) lo que está en Standard.
          </p>
        </>
      )}
    </Card>
  );
}

function LimitsForm({ limits }: { limits: StorageLimits }) {
  const qc = useQueryClient();
  const [dbGb, setDbGb] = useState(String(limits.dbGb));
  const [r2Gb, setR2Gb] = useState(String(limits.r2Gb));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const next = await api<StorageLimits>('/admin/storage/limits', {
        method: 'PUT',
        body: { dbGb: Number(dbGb), r2Gb: Number(r2Gb) },
      });
      qc.setQueryData<StorageReportDto>(KEY, (old) => (old ? { ...old, limits: next } : old));
      setMsg('Guardado ✓');
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Límite de la base de datos (GB)</span>
        <Input
          type="number"
          min={0.1}
          step={0.1}
          value={dbGb}
          onChange={(e) => setDbGb(e.target.value)}
          className="w-40"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Límite de R2 Standard (GB)</span>
        <Input
          type="number"
          min={0.1}
          step={0.1}
          value={r2Gb}
          onChange={(e) => setR2Gb(e.target.value)}
          className="w-40"
        />
      </label>
      <Button type="submit" variant="ghost" disabled={busy}>
        Guardar límites
      </Button>
      {msg && <span className="text-sm text-neutral-400">{msg}</span>}
    </form>
  );
}

export default function AdminStoragePage() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: KEY,
    queryFn: () => api<StorageReportDto>('/admin/storage'),
  });

  async function refresh() {
    setRefreshing(true);
    try {
      qc.setQueryData(KEY, await api<StorageReportDto>('/admin/storage?refresh=1'));
    } finally {
      setRefreshing(false);
    }
  }

  const r2Standard = data?.buckets.reduce((a, b) => a + b.standardBytes, 0) ?? 0;
  const tableRows = (t: StorageTableDto[]) =>
    t.map((x) => ({
      label: x.label,
      detail: `${x.table} · ${x.rows.toLocaleString('es-CL')} filas`,
      bytes: x.bytes,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-neutral-400 hover:text-neutral-200">
            ← Administración
          </Link>
          <h1 className="mt-1 text-2xl font-bold">💾 Almacenamiento</h1>
          <p className="text-sm text-neutral-400">
            Cuánto ocupa la plataforma frente a los límites de tu plan.
            {data && ` Medido: ${new Date(data.generatedAt).toLocaleString('es-CL')}.`}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? 'Midiendo…' : '↻ Volver a medir'}
        </Button>
      </div>

      {isLoading && <Spinner label="Midiendo…" />}
      {isError && (
        <Card className="text-sm text-red-300">
          {error instanceof ApiError ? error.message : 'No se pudo cargar.'}
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-3">
              <div>
                <h2 className="font-semibold">Base de datos (Postgres)</h2>
                <p className="text-xs text-neutral-500">
                  Incluye las imágenes guardadas en la base: fotos del chat, flyers, fotos y
                  galerías de los sociales.
                </p>
              </div>
              <Meter
                used={data.database.totalBytes}
                limit={data.limits.dbGb * GB}
                caption="disco de la base en el servidor"
              />
            </Card>
            <Card className="space-y-3">
              <div>
                <h2 className="font-semibold">Archivos (R2 Standard)</h2>
                <p className="text-xs text-neutral-500">
                  Audio del Estudio y media de academias. La capa gratis de R2 son 10 GB.
                </p>
              </div>
              <Meter used={r2Standard} limit={data.limits.r2Gb * GB} caption="R2 Standard" />
              <p className="text-xs text-neutral-400">
                Costo estimado de R2:{' '}
                <span className="font-semibold text-neutral-200">
                  US$ {data.r2EstimatedUsd.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                </span>{' '}
                al mes (Standard sobre 10 GB a US$ 0,015/GB + bóveda a US$ 0,01/GB; no incluye
                operaciones ni descargas de la bóveda).
              </p>
            </Card>
          </div>

          <Card className="space-y-3">
            <h2 className="font-semibold">Lo que más pesa en la base</h2>
            <Breakdown
              total={data.database.totalBytes}
              rows={tableRows(data.database.tables)}
            />
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {data.buckets.map((b) => (
              <BucketCard key={b.key} b={b} limits={data.limits} />
            ))}
          </div>

          <Card className="space-y-2">
            <h2 className="font-semibold">Límites</h2>
            <p className="text-xs text-neutral-500">
              Ajústalos a tu plan: el de la base, según el disco del servidor; el de R2, según tu
              presupuesto (10 GB es la capa gratis). Los medidores avisan al 70% y al 90%.
            </p>
            <LimitsForm key={`${data.limits.dbGb}-${data.limits.r2Gb}`} limits={data.limits} />
          </Card>

          <p className="text-xs text-neutral-500">
            Los cupos por academia (galería y bóveda) se ven en{' '}
            <Link href="/admin/academies" className="underline hover:text-neutral-300">
              Admin → Academias
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
