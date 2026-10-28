'use client';

import { useRouter } from 'next/navigation';
import type { EventDto } from '@baile-latino/types';
import { StyleBadge } from '@/components/ui';
import { clsx } from '@/components/clsx';
import { flyerUrl, formatEventDate } from '@/lib/events';
import { InstagramLink } from '@/components/instagram-link';

export function EventCard({ ev, past = false }: { ev: EventDto; past?: boolean }) {
  const router = useRouter();
  const img = flyerUrl(ev);
  const cancelled = ev.status === 'CANCELLED';
  const where = [ev.venueName, ev.city].filter(Boolean).join(' · ');
  const href = `/events/${ev.id}`;
  // La tarjeta navega al detalle, pero no es un <a>: adentro va el chip de
  // Instagram (un link real) y un <a> dentro de otro <a> es HTML inválido.
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(href);
      }}
      className={clsx(
        'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        'flex gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 transition hover:border-brand/60 hover:bg-neutral-900',
        (past || cancelled) && 'opacity-60',
      )}
    >
      <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            📅
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="truncate font-semibold">{ev.title}</div>
          {cancelled && (
            <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
              CANCELADO
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-brand">{formatEventDate(ev.startsAt)}</div>
        {where && <div className="truncate text-sm text-neutral-300">{where}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
          {ev.styles.map((s) => (
            <StyleBadge key={s} style={s} />
          ))}
          {ev.bachataPct != null && (
            <span>{ev.bachataPct}% bachata</span>
          )}
          {ev.priceInfo && <span className="truncate">{ev.priceInfo}</span>}
        </div>
        {(ev.organizerName || ev.organizerInstagram) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
            {ev.organizerName && <span className="truncate">{ev.organizerName}</span>}
            {ev.organizerInstagram && (
              <InstagramLink handle={ev.organizerInstagram} size="sm" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
