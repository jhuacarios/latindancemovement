'use client';

import Link from 'next/link';
import { Card } from '@/components/ui';

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🛡️ Administración</h1>
        <p className="text-sm text-neutral-400">
          Configuración de la plataforma.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link href="/admin/users">
          <Card className="h-full transition hover:border-brand/60">
            <div className="font-semibold">Usuarios</div>
            <div className="mt-1 text-sm text-neutral-400">
              Crea usuarios, cambia sus roles y elimínalos.
            </div>
          </Card>
        </Link>
        <Link href="/admin/roles">
          <Card className="h-full transition hover:border-brand/60">
            <div className="font-semibold">Roles y permisos</div>
            <div className="mt-1 text-sm text-neutral-400">
              Define qué puede ver, editar y eliminar cada rol en cada módulo.
            </div>
          </Card>
        </Link>
        <Link href="/admin/tags">
          <Card className="h-full transition hover:border-brand/60">
            <div className="font-semibold">Estilos y sub-estilos</div>
            <div className="mt-1 text-sm text-neutral-400">
              Vocabulario de tags que los DJs asocian a sus canciones.
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
