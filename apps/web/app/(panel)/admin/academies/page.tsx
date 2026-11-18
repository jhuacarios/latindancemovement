'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACADEMY_PLAN_STORAGE_GB, ACADEMY_PLAN_VAULT_GB, type AcademyAdminRowDto } from '@baile-latino/types';
import { ApiError } from '@/lib/api';
import { academiesApi, planDate, planDateInput } from '@/lib/academies';
import { StorageBar } from '@/components/academy-vault';
import { Button, Card, Input, Spinner } from '@/components/ui';

const GB = 1024 ** 3;

/** YYYY-MM-DD de hoy (o de la fecha dada) + n meses. */
function plusMonths(fromIso: string | null, months: number): string {
  const base = fromIso && Date.parse(fromIso) > Date.now() ? new Date(fromIso) : new Date();
  base.setMonth(base.getMonth() + months);
  return planDateInput(base.toISOString());
}

/**
 * Admin → Academias: el Plan Director de cada academia (lo paga el director; por
 * ahora se cobra por fuera y se activa acá a mano) y sus cupos.
 */
export default function AdminAcademiesPage() {
  const q = useQuery({ queryKey: ['academies', 'admin-plans'], queryFn: academiesApi.adminPlans });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Academias · Plan Director</h1>
        <p className="text-sm text-neutral-400">
          El Plan Director incluye {ACADEMY_PLAN_STORAGE_GB} GB de galería y {ACADEMY_PLAN_VAULT_GB} GB de bóveda. Sin plan
          vigente la academia queda en solo lectura: se ve y se descarga, pero no se sube ni se mueve. Por ahora se cobra por
          fuera (transferencia) y se activa acá.
        </p>
      </div>
      {q.isLoading && <Spinner />}
      {q.isError && <Card className="text-sm text-red-300">No se pudieron cargar las academias.</Card>}
      {q.data && q.data.length === 0 && <Card className="text-sm text-neutral-400">Todavía no hay academias.</Card>}
      <div className="space-y-3">
        {q.data?.map((r) => <PlanRow key={r.id} r={r} />)}
      </div>
    </div>
  );
}

function PlanRow({ r }: { r: AcademyAdminRowDto }) {
  const qc = useQueryClient();
  const [expires, setExpires] = useState(planDateInput(r.plan.expiresAt));
  const [storageGb, setStorageGb] = useState(String(Math.round(r.storage.quotaBytes / GB)));
  const [vaultGb, setVaultGb] = useState(String(Math.round(r.storage.vaultQuotaBytes / GB)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [directorEmail, setDirectorEmail] = useState('');

  const changeDirector = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const row = await academiesApi.setDirector(r.id, directorEmail);
      setDirectorEmail('');
      setMsg({ ok: true, text: `Ahora el director es ${row.ownerName ?? row.ownerEmail}. El anterior quedó como profesor.` });
      void qc.invalidateQueries({ queryKey: ['academies'] });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'No se pudo cambiar el director.' });
    } finally {
      setBusy(false);
    }
  };

  const save = async (expiresAt: string | null) => {
    const s = Number(storageGb);
    const v = Number(vaultGb);
    if (!Number.isInteger(s) || s < 1 || !Number.isInteger(v) || v < 0) {
      setMsg({ ok: false, text: 'Los cupos van en GB enteros (galería al menos 1).' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const row = await academiesApi.setPlan(r.id, { expiresAt, storageQuotaGb: s, vaultQuotaGb: v });
      setExpires(planDateInput(row.plan.expiresAt));
      setMsg({ ok: true, text: 'Guardado.' });
      void qc.invalidateQueries({ queryKey: ['academies'] });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'No se pudo guardar.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href={`/academies/${r.id}`} className="font-semibold hover:text-brand">
            {r.name}
          </Link>
          {r.city && <span className="text-sm text-neutral-400"> · {r.city}</span>}
          <div className="text-xs text-neutral-500">
            Director: {r.ownerName ?? '—'}
            {r.ownerEmail && ` (${r.ownerEmail})`}
          </div>
        </div>
        <span className={r.plan.active ? 'text-sm text-emerald-300' : 'text-sm text-amber-300'}>
          {r.plan.active && r.plan.expiresAt
            ? `⭐ Vigente hasta el ${planDate(r.plan.expiresAt)}`
            : r.plan.expiresAt
              ? `Vencido el ${planDate(r.plan.expiresAt)} (solo lectura)`
              : 'Sin plan (solo lectura)'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StorageBar label="Galería" used={r.storage.usedBytes} quota={r.storage.quotaBytes} />
        <StorageBar label="Bóveda" used={r.storage.vaultUsedBytes} quota={r.storage.vaultQuotaBytes} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-neutral-400">
          <span>Vigente hasta</span>
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
        <label className="w-28 space-y-1 text-xs text-neutral-400">
          <span>Galería (GB)</span>
          <Input type="number" min={1} value={storageGb} onChange={(e) => setStorageGb(e.target.value)} />
        </label>
        <label className="w-28 space-y-1 text-xs text-neutral-400">
          <span>Bóveda (GB)</span>
          <Input type="number" min={0} value={vaultGb} onChange={(e) => setVaultGb(e.target.value)} />
        </label>
        <Button size="sm" onClick={() => save(expires || null)} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-500">Atajos:</span>
        <Button size="sm" variant="ghost" onClick={() => save(plusMonths(r.plan.expiresAt, 1))} disabled={busy}>
          +1 mes
        </Button>
        <Button size="sm" variant="ghost" onClick={() => save(plusMonths(r.plan.expiresAt, 12))} disabled={busy}>
          +1 año
        </Button>
        {r.plan.expiresAt && (
          <Button size="sm" variant="ghost" onClick={() => save(null)} disabled={busy}>
            Quitar plan
          </Button>
        )}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void changeDirector();
        }}
      >
        <label className="min-w-56 flex-1 space-y-1 text-xs text-neutral-400 sm:max-w-sm">
          <span>Cambiar director (correo de su cuenta)</span>
          <Input type="email" value={directorEmail} onChange={(e) => setDirectorEmail(e.target.value)} placeholder="nuevo@director.cl" />
        </label>
        <Button size="sm" variant="ghost" type="submit" disabled={busy || !directorEmail.includes('@')}>
          Cambiar director
        </Button>
      </form>
      {msg && <p className={msg.ok ? 'text-xs text-emerald-300' : 'text-xs text-red-300'}>{msg.text}</p>}
    </Card>
  );
}
