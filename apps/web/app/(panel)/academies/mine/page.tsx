'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { academiesApi } from '@/lib/academies';
import { usePermissions } from '@/lib/permissions';
import { useEffectiveRole } from '@/lib/view-as-role';
import { AcademyCard } from '@/components/academy-card';
import { Button, Card, Spinner } from '@/components/ui';

export default function MyAcademiesPage() {
  const role = useEffectiveRole();
  const perms = usePermissions();
  // Por ahora solo el super admin crea academias.
  const canCreate = role === 'SUPER_ADMIN' && perms.can(role, 'classes.create', 'ver');
  const q = useQuery({ queryKey: ['academies', 'mine'], queryFn: academiesApi.mine });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mis academias</h1>
          <p className="text-sm text-neutral-400">
            Las academias que administras, como director o profesor. Ahí publicas el horario y subes los videos.
          </p>
        </div>
        {canCreate && (
          <Link href="/academies/new">
            <Button>+ Crear academia</Button>
          </Link>
        )}
      </div>

      {q.isLoading && <Spinner />}
      {q.data && q.data.length === 0 && (
        <Card className="space-y-2 text-sm text-neutral-400">
          <p>Todavía no administras ninguna academia.</p>
          <p>
            Si eres profesor de una academia que ya está en Nectason, pídele al director que te agregue con el correo de tu
            cuenta.
          </p>
          <p>¿Quieres registrar tu academia y ser su director? Escríbenos y la creamos con tu cuenta.</p>
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
