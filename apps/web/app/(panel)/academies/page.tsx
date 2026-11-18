'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CHILE_REGIONS, type ChileRegion } from '@baile-latino/types';
import { academiesApi } from '@/lib/academies';
import { usePermissions } from '@/lib/permissions';
import { useEffectiveRole } from '@/lib/view-as-role';
import { AcademyCard } from '@/components/academy-card';
import { Button, Card, Select, Spinner } from '@/components/ui';

export default function AcademiesPage() {
  const [region, setRegion] = useState<ChileRegion | ''>('');
  const role = useEffectiveRole();
  const perms = usePermissions();
  // Por ahora solo el super admin crea academias.
  const canCreate = role === 'SUPER_ADMIN' && perms.can(role, 'classes.create', 'ver');
  const q = useQuery({ queryKey: ['academies', 'list', region], queryFn: () => academiesApi.list(region) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🎓 Academias</h1>
          <p className="text-sm text-neutral-400">Academias de baile con su horario de clases y los videos de cada clase.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={region} onChange={(e) => setRegion(e.target.value as ChileRegion | '')}>
            <option value="">Todas las regiones</option>
            {CHILE_REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </Select>
          {canCreate && (
            <Link href="/academies/new">
              <Button>+ Crear academia</Button>
            </Link>
          )}
        </div>
      </div>

      {q.isLoading && <Spinner label="Cargando academias…" />}
      {q.isError && <Card className="text-sm text-red-300">No se pudieron cargar las academias.</Card>}
      {q.data && q.data.length === 0 && (
        <Card className="text-sm text-neutral-400">
          {region ? 'No hay academias en esta región todavía.' : 'Todavía no hay academias.'}
        </Card>
      )}
      {q.data && q.data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((a) => (
            <AcademyCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
