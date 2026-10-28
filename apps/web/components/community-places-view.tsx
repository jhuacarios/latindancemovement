'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CommunityPlaceDto,
  CommunityPlacesByRegionResponse,
  CommunityPlacesRegionSection,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/permissions';
import { useEffectiveRole } from '@/lib/view-as-role';
import { mapsSearchLink } from '@/lib/maps';
import { deletePlace, placePhotoUrl, type PlaceKindCopy } from '@/lib/community-places';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';
import { clsx } from '@/components/clsx';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';
import { CommunityPlaceModal } from '@/components/community-place-modal';
import { InstagramLink } from '@/components/instagram-link';

function PlaceCard({
  p,
  copy,
  canEdit,
  onEdit,
  onDelete,
}: {
  p: CommunityPlaceDto;
  copy: PlaceKindCopy;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const img = placePhotoUrl(p);
  // Sociales: "lugar · ciudad"; salsotecas: "dirección · ciudad" (la referencia va aparte).
  // DJs: solo ciudad, y la academia/colectivo aparte.
  const isOutdoor = copy.kind === 'OUTDOOR_SOCIAL';
  const isDj = copy.kind === 'DJ';
  const where = isDj
    ? (p.city ?? '')
    : [isOutdoor ? p.place : p.address, p.city].filter(Boolean).join(' · ');
  const extra = isOutdoor ? p.address : p.place;
  const maps = copy.hideMap
    ? null
    : mapsSearchLink({
        place: isOutdoor ? p.place : p.name,
        address: p.address,
        city: p.city,
        region: p.region,
      });
  return (
    <div
      className={clsx(
        'flex gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-3',
        !p.active && 'opacity-60',
      )}
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl">
            {copy.emoji}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold">{p.name}</div>
          {!p.active && (
            <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
              {copy.inactiveLabel}
            </span>
          )}
        </div>
        {where && <div className="text-sm text-neutral-300">{where}</div>}
        {extra && <div className="text-xs text-neutral-500">{extra}</div>}
        {p.schedule && <div className="text-sm text-brand">{p.schedule}</div>}
        {p.description && (
          <div className="mt-1 line-clamp-2 text-xs text-neutral-400">{p.description}</div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {p.styles.map((st) => (
            <StyleBadge key={st} style={st} />
          ))}
          {p.instagramHandles.map((h) => (
            <InstagramLink key={h} handle={h} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {maps && (
            <a href={maps} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              📍 Cómo llegar
            </a>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="text-neutral-400 hover:text-neutral-200"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="text-red-400/80 hover:text-red-300"
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RegionSection({
  section,
  copy,
  defaultOpen,
  renderCard,
}: {
  section: CommunityPlacesRegionSection;
  copy: PlaceKindCopy;
  defaultOpen: boolean;
  renderCard: (p: CommunityPlaceDto) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const empty = section.places.length === 0;
  return (
    <section
      className={clsx('rounded-xl border', empty ? 'border-neutral-800/60' : 'border-neutral-800')}
    >
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
            className={clsx('font-normal', section.count > 0 ? 'text-brand' : 'text-neutral-500')}
          >
            ({section.count} {section.count === 1 ? copy.one : copy.many})
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
        <div className="grid gap-3 border-t border-neutral-800 px-4 py-4 md:grid-cols-2 xl:grid-cols-3">
          {section.places.map(renderCard)}
        </div>
      )}
    </section>
  );
}

/** Directorio por región de un tipo de lugar (sociales al aire libre, salsotecas…). */
export function CommunityPlacesView({ copy }: { copy: PlaceKindCopy }) {
  const { user } = useAuth();
  const perms = usePermissions();
  const role = useEffectiveRole();
  const qc = useQueryClient();
  const canCreate = role ? perms.can(role, copy.createPermKey, 'ver') : false;

  const [includeInactive, setIncludeInactive] = useState(false);
  const [modal, setModal] = useState<{ existing: CommunityPlaceDto | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ['community-places', copy.kind];
  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: [...queryKey, { includeInactive }],
    queryFn: () =>
      api<CommunityPlacesByRegionResponse>(
        `/community/places?kind=${copy.kind}&includeInactive=${includeInactive}`,
      ),
  });

  const refresh = () => qc.invalidateQueries({ queryKey });

  const remove = (p: CommunityPlaceDto) =>
    setConfirm({
      title: `Eliminar ${copy.one}`,
      message: (
        <>
          ¿Eliminar <span className="font-semibold">{p.name}</span>? Si solo está en
          pausa o cerró temporalmente, mejor edítalo y desmarca &quot;Activo&quot;.
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: () => {
        void deletePlace(p.id)
          .then(refresh)
          .catch((e) =>
            setError(e instanceof ApiError ? e.message : 'No se pudo eliminar.'),
          );
      },
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {copy.emoji} {copy.title}
          </h1>
          <p className="text-sm text-neutral-400">{copy.intro}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-brand"
            />
            Mostrar inactivos
          </label>
          {canCreate && (
            <Button type="button" onClick={() => setModal({ existing: null })}>
              + {copy.addLabel}
            </Button>
          )}
        </div>
      </div>

      {isLoading && <Spinner label="Cargando…" />}

      {(isError || error) && (
        <Card className="text-sm text-red-300">
          {error ??
            (loadError instanceof ApiError ? loadError.message : 'No se pudo cargar.')}
        </Card>
      )}

      {data && data.total === 0 && (
        <Card className="text-sm text-neutral-400">
          Todavía no hay {copy.many} registradas.
          {canCreate && ` Agrega la primera con el botón de arriba.`}
        </Card>
      )}

      {data && (
        <div className="space-y-3">
          {data.sections.map((sec) => (
            <RegionSection
              key={sec.region}
              section={sec}
              copy={copy}
              defaultOpen={sec.count > 0}
              renderCard={(p) => (
                <PlaceCard
                  key={p.id}
                  p={p}
                  copy={copy}
                  canEdit={Boolean(
                    user && (user.role === 'SUPER_ADMIN' || p.createdById === user.id),
                  )}
                  onEdit={() => setModal({ existing: p })}
                  onDelete={() => remove(p)}
                />
              )}
            />
          ))}
        </div>
      )}

      {modal && (
        <CommunityPlaceModal
          copy={copy}
          existing={modal.existing}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void refresh();
          }}
        />
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
