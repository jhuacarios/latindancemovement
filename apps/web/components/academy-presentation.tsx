'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { placeLabel, regionName, type AcademyDto, type AcademyVideoDto } from '@baile-latino/types';
import {
  LEVEL_LABEL,
  MEMBER_ROLE_LABEL,
  WEEKDAYS,
  WEEK_ORDER,
  academiesApi,
  classTimeRange,
  formatVideoDuration,
} from '@/lib/academies';
import { mapsSearchLink } from '@/lib/maps';
import { api, API_BASE, ApiError, uploadForm } from '@/lib/api';
import { AcademyLogo } from '@/components/academy-card';
import { AcademyVideoPlayer } from '@/components/academy-video-player';
import { InstagramIcon } from '@/components/instagram-link';
import { UserAvatar } from '@/components/user-avatar';
import { Card, StyleBadge } from '@/components/ui';
import { clsx } from '@/components/clsx';

/**
 * Galería abierta de la academia: lo que no es de ninguna clase + lo marcado con ⭐
 * (lo ve cualquiera con cuenta). Comparte la consulta con la pestaña de fotos y videos.
 */
export function usePublicGallery(academyId: string) {
  const q = useQuery({
    queryKey: ['academies', 'videos', academyId, ''],
    queryFn: () => academiesApi.videos(academyId),
  });
  const items = (q.data ?? []).filter((v) => v.classId === null || v.featured);
  return { items, isLoading: q.isLoading };
}

/** Achica la portada a 1920 px de ancho (JPG): se ve nítida y pesa poco. */
function coverJpeg(file: File, maxW = 1920): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = Math.min(maxW, img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('img'));
    };
    img.src = url;
  });
}

/**
 * Portada: la foto que eligió el director o, si no hay, un mosaico de la galería
 * abierta. Encima van el logo, el nombre y los datos. Quien administra la cambia.
 */
export function AcademyHero({
  a,
  manages = false,
  onChanged,
  onGallery,
}: {
  a: AcademyDto;
  manages?: boolean;
  onChanged?: () => void;
  /** Ir a Fotos y videos (para elegir lo que sale en el mosaico). */
  onGallery?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { items } = usePublicGallery(a.id);
  const covers = [...items]
    .filter((v) => v.thumbUrl)
    .sort((x, y) => Number(y.kind === 'PHOTO') - Number(x.kind === 'PHOTO'))
    .slice(0, 5);
  const where = [placeLabel(a.city, a.commune), regionName(a.region)].filter(Boolean).join(' · ');
  const coverUrl = a.coverAt ? `${API_BASE}/academies/${a.id}/cover?v=${encodeURIComponent(a.coverAt)}` : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMenu(false);
      onChanged?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo usar esa imagen.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const upload = (f: File | undefined) =>
    f &&
    void run(async () => {
      const fd = new FormData();
      fd.append('file', await coverJpeg(f), 'portada.jpg');
      await uploadForm(`/academies/${a.id}/cover`, fd, 'PUT');
    });

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/60">
      <div className="relative h-48 sm:h-72">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : covers.length > 0 ? (
          <div
            className={clsx(
              'grid h-full gap-0.5',
              covers.length === 1 ? 'grid-cols-1' : covers.length < 5 ? 'grid-cols-2' : 'grid-cols-4 grid-rows-2',
            )}
          >
            {covers.map((v, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={v.id}
                src={v.thumbUrl!}
                alt=""
                className={clsx(
                  'h-full w-full object-cover',
                  covers.length >= 5 && i === 0 && 'col-span-2 row-span-2',
                  covers.length === 3 && i === 0 && 'row-span-2',
                )}
              />
            ))}
          </div>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand/40 via-neutral-900 to-neutral-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/30 to-transparent" />
        {manages && (
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              disabled={busy}
              className="rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/75"
            >
              {busy ? 'Guardando…' : '✎ Editar portada'}
            </button>
            {menu && (
              <div className="w-64 space-y-2 rounded-xl border border-neutral-700 bg-neutral-950/95 p-3 text-xs text-neutral-300 shadow-xl">
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="w-full rounded-lg bg-brand px-3 py-2 font-medium text-white hover:bg-brand-dark"
                >
                  {coverUrl ? 'Cambiar foto de portada' : 'Subir foto de portada'}
                </button>
                {coverUrl && (
                  <button
                    type="button"
                    onClick={() => void run(() => api(`/academies/${a.id}/cover`, { method: 'DELETE' }))}
                    className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-neutral-300 hover:border-red-400/60 hover:text-red-300"
                  >
                    Quitar portada
                  </button>
                )}
                <p className="text-neutral-500">
                  Mejor una foto horizontal. Sin portada, el banner muestra un mosaico de la galería de la academia
                  {onGallery && (
                    <>
                      {' '}
                      (
                      <button type="button" onClick={onGallery} className="text-brand hover:underline">
                        elegir qué sale
                      </button>
                      )
                    </>
                  )}
                  .
                </p>
                {error && <p className="text-red-300">{error}</p>}
              </div>
            )}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </div>
        )}
      </div>
      <div className="relative -mt-14 flex flex-wrap items-end gap-4 px-4 pb-4 sm:-mt-16 sm:px-6 sm:pb-5">
        <AcademyLogo a={a} className="h-24 w-24 rounded-2xl ring-4 ring-neutral-950 sm:h-28 sm:w-28" />
        <div className="min-w-0 flex-1 pb-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{a.name}</h1>
          {where && <p className="text-sm text-neutral-300">{where}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {a.styles.map((s) => (
              <StyleBadge key={s} style={s} />
            ))}
            {a.instagramHandle && (
              <a
                href={`https://instagram.com/${a.instagramHandle}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-600 to-orange-500 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
              >
                <InstagramIcon className="h-3.5 w-3.5" />@{a.instagramHandle}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function BigGallery({ a, manages }: { a: AcademyDto; manages: boolean }) {
  const { items, isLoading } = usePublicGallery(a.id);
  const [playing, setPlaying] = useState<number | null>(null);
  return (
    <Section title="Galería">
      {isLoading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {manages
            ? 'Todavía no hay nada en la galería abierta. Sube fotos y videos sin clase o marca los de una clase con "⭐ Mostrar en la galería".'
            : 'La academia todavía no ha publicado fotos ni videos.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((v, i) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setPlaying(i)}
              className="group relative aspect-square overflow-hidden rounded-xl bg-neutral-800"
              title={v.title}
            >
              {v.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumbUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-3xl">{v.kind === 'PHOTO' ? '🖼️' : '🎬'}</span>
              )}
              {v.kind === 'VIDEO' && (
                <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                  ▶ {formatVideoDuration(v.durationMs) ?? ''}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {playing !== null && items[playing] && (
        <AcademyVideoPlayer
          academyId={a.id}
          items={items as AcademyVideoDto[]}
          index={playing}
          onIndex={setPlaying}
          onClose={() => setPlaying(null)}
        />
      )}
    </Section>
  );
}

function ScheduleSummary({ a, onOpen }: { a: AcademyDto; onOpen: () => void }) {
  const active = a.classes.filter((c) => c.active);
  return (
    <Section
      title="Horario"
      action={
        active.length > 0 && (
          <button type="button" onClick={onOpen} className="text-xs text-brand hover:underline">
            Inscribirse →
          </button>
        )
      }
    >
      {active.length === 0 ? (
        <p className="text-sm text-neutral-500">Sin clases publicadas por ahora.</p>
      ) : (
        <ul className="space-y-2.5">
          {WEEK_ORDER.flatMap((d) =>
            active
              .filter((c) => c.weekday === d)
              .sort((x, y) => x.startTime.localeCompare(y.startTime))
              .map((c) => {
                const full = c.capacity !== null && c.enrolledCount >= c.capacity;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={onOpen} className="w-full text-left">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{c.title}</span>
                        {c.myEnrollment === 'ACCEPTED' && <span className="text-[11px] text-brand">✓ Inscrito</span>}
                        {c.myEnrollment === 'PENDING' && <span className="text-[11px] text-amber-300">⏳ Pendiente</span>}
                      </div>
                      <div className="text-xs text-neutral-400">
                        {WEEKDAYS[c.weekday]} {classTimeRange(c)} · {LEVEL_LABEL[c.level]}
                        {c.capacity !== null && ` · ${full ? 'llena' : `${c.capacity - c.enrolledCount} cupos`}`}
                      </div>
                    </button>
                  </li>
                );
              }),
          )}
        </ul>
      )}
    </Section>
  );
}

/** Pestaña de inicio: lo que ve quien llega a la academia (sin nada de gestión). */
export function AcademyPresentation({
  a,
  manages,
  onSchedule,
  onEdit,
}: {
  a: AcademyDto;
  manages: boolean;
  onSchedule: () => void;
  onEdit: () => void;
}) {
  const maps = mapsSearchLink({
    place: a.name,
    address: a.address,
    city: a.city,
    commune: a.commune,
    region: a.region,
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        {(a.description || manages) && (
          <Section
            title="Sobre la academia"
            action={
              manages && (
                <button type="button" onClick={onEdit} className="text-xs text-neutral-400 hover:text-neutral-200">
                  Editar
                </button>
              )
            }
          >
            {a.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-200">{a.description}</p>
            ) : (
              <p className="text-sm text-neutral-500">
                Todavía no hay descripción. Cuenta quiénes son, qué enseñan y para quién son sus clases.
              </p>
            )}
          </Section>
        )}
        <BigGallery a={a} manages={manages} />
      </div>

      <div className="space-y-4">
        <ScheduleSummary a={a} onOpen={onSchedule} />
        {(a.address || a.city) && (
          <Section title="Dónde">
            <p className="text-sm text-neutral-200">
              {a.address && (
                <>
                  {a.address}
                  <br />
                </>
              )}
              <span className="text-neutral-400">
                {[placeLabel(a.city, a.commune), regionName(a.region)].filter(Boolean).join(' · ')}
              </span>
            </p>
            {maps && (
              <a
                href={maps}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-brand/60 hover:text-brand"
              >
                📍 Cómo llegar
              </a>
            )}
          </Section>
        )}
        {a.team.length > 0 && (
          <Section title="Equipo">
            <ul className="space-y-2.5">
              {a.team.map((m) => (
                <li key={m.userId} className="flex items-center gap-3">
                  <UserAvatar
                    user={{ id: m.userId, avatarAt: m.avatarAt, name: m.name, displayName: null }}
                    className="h-9 w-9 text-sm"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-neutral-500">{MEMBER_ROLE_LABEL[m.role]}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
