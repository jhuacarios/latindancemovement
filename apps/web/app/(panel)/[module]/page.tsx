'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { moduleByKey } from '@/lib/modules';
import { Card } from '@/components/ui';

export default function ModulePlaceholderPage() {
  const params = useParams<{ module: string }>();
  const mod = moduleByKey(params.module);

  if (!mod) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <div className="mb-2 text-4xl">🔍</div>
        <h2 className="text-lg font-semibold">Módulo no encontrado</h2>
        <Link
          href="/inicio"
          className="mt-4 inline-block text-sm text-brand hover:underline"
        >
          ← Volver al inicio
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">
          {mod.icon} {mod.title}
        </h1>
        <p className="text-sm text-neutral-400">{mod.description}</p>
      </div>

      <Card className="flex flex-col items-center py-16 text-center">
        <div className="text-5xl">🚧</div>
        <h2 className="mt-3 text-lg font-semibold">Próximamente</h2>
        <p className="mt-1 max-w-md text-sm text-neutral-400">
          Este módulo todavía no está construido. La estructura y el acceso por
          rol ya están listos; las pantallas llegan en una próxima entrega.
        </p>
        <Link
          href="/inicio"
          className="mt-5 inline-block text-sm text-brand hover:underline"
        >
          ← Volver al inicio
        </Link>
      </Card>
    </div>
  );
}
