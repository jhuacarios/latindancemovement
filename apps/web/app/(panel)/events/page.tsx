'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { EventsByRegionResponse, EventsRegionSection } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';
import { useEffectiveRole } from '@/lib/view-as-role';
import { Card, Spinner } from '@/components/ui';
import { clsx } from '@/components/clsx';
import { EventCard } from '@/components/event-card';

function RegionSection({
  section,
  defaultOpen,
}: {
  section: EventsRegionSection;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const empty = section.events.length === 0;
  const upcoming = section.events.slice(0, section.upcomingCount);
  const past = section.events.slice(section.upcomingCount);
  return (
    <section className={clsx('rounded-xl border', empty ? 'border-neutral-800/60' : 'border-neutral-800')}>
      <button
        type="button"
        onClick={() => !empty && setOpen((o) => !o)}
        aria-expanded={open}
        className={clsx(
          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
          empty ? 'cursor-default text-neutral-500' : 'hover:bg-neutral-900/60',
        )}
      >
        <h2 className="text-base font-semibold lg:text-lg">
          {section.name}{' '}
          <span
            className={clsx(
              'font-normal',
              section.upcomingCount > 0 ? 'text-brand' : 'text-neutral-500',
            )}
          >
            ({section.upcomingCount}{' '}
            {section.upcomingCount === 1 ? 'próximo' : 'próximos'})
          </span>
        </h2>
        {!empty && (
          <span
            aria-hidden
            className={clsx('text-xs text-neutral-500 transition-transform', open && 'rotate-90')}
          >
            ▶
          </span>
        )}
      </button>
      {open && !empty && (
        <div className="space-y-3 border-t border-neutral-800 px-4 py-4">
          {upcoming.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {upcoming.map((ev) => (
                <EventCard key={ev.id} ev={ev} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <>
              <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Ya realizados
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {past.map((ev) => (
                  <EventCard key={ev.id} ev={ev} past />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function EventsPage() {
  const [includePast, setIncludePast] = useState(false);
  const perms = usePermissions();
  const role = useEffectiveRole();
  const canCreate = role ? perms.can(role, 'events.create', 'ver') : false;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['events', { includePast }],
    queryFn: () =>
      api<EventsByRegionResponse>(`/events?includePast=${includePast}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📅 Eventos</h1>
          <p className="text-sm text-neutral-400">
            Sociales y eventos de baile por región, de norte a sur.
            {data && (
              <>
                {' '}
                <span className="text-neutral-300">
                  {data.upcomingTotal} próximo{data.upcomingTotal === 1 ? '' : 's'}
                </span>{' '}
                en todo Chile.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={includePast}
              onChange={(e) => setIncludePast(e.target.checked)}
              className="accent-brand"
            />
            Mostrar ya realizados
          </label>
          {canCreate && (
            <Link
              href="/events/new"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
            >
              + Publicar evento
            </Link>
          )}
        </div>
      </div>

      {isLoading && <Spinner label="Cargando eventos…" />}

      {isError && (
        <Card className="text-sm text-red-300">
          {error instanceof ApiError ? error.message : 'No se pudieron cargar los eventos.'}
        </Card>
      )}

      {data && data.total === 0 && (
        <Card className="text-sm text-neutral-400">
          Todavía no hay eventos publicados.
          {canCreate && (
            <>
              {' '}
              <Link href="/events/new" className="text-brand hover:underline">
                Publica el primero desde su flyer →
              </Link>
            </>
          )}
        </Card>
      )}

      {data && (
        <div className="space-y-3">
          {data.sections.map((s) => (
            <RegionSection
              key={s.region}
              section={s}
              defaultOpen={s.upcomingCount > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
