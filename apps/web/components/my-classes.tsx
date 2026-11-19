'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { WEEKDAYS, academiesApi, academyLogoUrl } from '@/lib/academies';
import { Card, Spinner } from '@/components/ui';

/** Mis clases: inscripciones aceptadas y solicitudes pendientes (perfil). */
export function MyClasses() {
  const { data, isLoading } = useQuery({
    queryKey: ['academies', 'my-enrollments'],
    queryFn: academiesApi.myEnrollments,
  });

  if (isLoading) return <Card><Spinner /></Card>;
  const list = data ?? [];
  if (list.length === 0) {
    return (
      <Card className="text-sm text-neutral-400">
        Todavía no estás inscrito en ninguna clase.{' '}
        <Link href="/academies" className="text-brand hover:underline">
          Busca una academia
        </Link>{' '}
        y pide inscripción en la clase que quieras.
      </Card>
    );
  }

  // Las aceptadas primero; luego las pendientes.
  const sorted = [...list].sort((a, b) => Number(b.status === 'ACCEPTED') - Number(a.status === 'ACCEPTED'));
  return (
    <Card className="divide-y divide-neutral-800 p-0">
      {sorted.map((e) => {
        const logo = academyLogoUrl({ id: e.academyId, hasLogo: e.academyHasLogo });
        return (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-800">🎓</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{e.classTitle}</div>
              <div className="truncate text-xs text-neutral-500">
                <Link href={`/academies/${e.academyId}`} className="hover:text-neutral-300 hover:underline">
                  {e.academyName}
                </Link>{' '}
                · {WEEKDAYS[e.weekday]} {e.startTime}
              </div>
            </div>
            {e.status === 'ACCEPTED' ? (
              <div className="flex shrink-0 items-center gap-3 text-xs">
                <span className="rounded bg-brand/15 px-2 py-0.5 font-semibold text-brand">✓ Inscrito</span>
                {e.chatId && (
                  <Link href={`/chat/${e.chatId}`} className="text-brand hover:underline">
                    💬 Chat
                  </Link>
                )}
              </div>
            ) : (
              <span className="shrink-0 rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                ⏳ Pendiente
              </span>
            )}
          </div>
        );
      })}
    </Card>
  );
}
