'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  pctFromStyles,
  placeLabel,
  regionName,
  styleMixLabel,
  type CommunityPlaceDto,
} from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { mapsEmbedUrl, mapsSearchLink } from '@/lib/maps';
import {
  PLACE_KINDS,
  deletePlace,
  placePhotoUrl,
  replacePlacePhoto,
} from '@/lib/community-places';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { StyleMixBar } from '@/components/style-mix';
import { InstagramLink } from '@/components/instagram-link';
import { CommunityPlaceModal } from '@/components/community-place-modal';
import { PlaceGallery } from '@/components/place-gallery';
import { compressImage } from '@/lib/image-compress';
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <div className="text-neutral-500">{label}</div>
      <div className="min-w-0 break-words text-neutral-200">{children}</div>
    </div>
  );
}

/** Cambiar la foto principal (la de la tarjeta). Solo SUPER_ADMIN o el administrador. */
function MainPhotoButton({
  place,
  onChange,
}: {
  place: CommunityPlaceDto;
  onChange: (p: CommunityPlaceDto) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          setError(null);
          try {
            const { file } = await compressImage(f, 1280);
            onChange(await replacePlacePhoto(place.id, file));
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'No se pudo subir la foto.');
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button type="button" variant="ghost" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Subiendo…' : place.hasPhoto ? 'Cambiar foto principal' : 'Agregar foto principal'}
      </Button>
      <span className="text-xs text-neutral-500">La que se ve en la tarjeta del listado.</span>
      {error && <span className="text-sm text-red-300">{error}</span>}
    </div>
  );
}

/** Asignar o quitar el administrador (solo SUPER_ADMIN). */
function AdminAssign({
  place,
  onChange,
}: {
  place: CommunityPlaceDto;
  onChange: (p: CommunityPlaceDto) => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (value: string | null) => {
    setBusy(true);
    setError(null);
    try {
      onChange(
        await api<CommunityPlaceDto>(`/community/places/${place.id}/admin`, {
          method: 'PATCH',
          body: { email: value },
        }),
      );
      setEmail('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold text-neutral-300">Administrador</h2>
      <p className="text-xs text-neutral-500">
        Puede cambiar la foto y la galería de fotos. Solo tú lo asignas.
      </p>
      {place.adminName ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-neutral-200">{place.adminName}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send(null)}
            className="text-xs text-red-400/80 hover:text-red-300"
          >
            Quitar
          </button>
        </div>
      ) : (
        <p className="text-sm text-neutral-400">Sin administrador.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void send(email.trim());
        }}
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@gmail.com"
        />
        <Button type="submit" disabled={busy || !email.trim()}>
          {place.adminName ? 'Cambiar' : 'Asignar'}
        </Button>
      </form>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </Card>
  );
}

/** Detalle de un social al aire libre, salsoteca o DJ. */
export default function CommunityPlaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: p, isLoading, isError, error: loadError } = useQuery({
    queryKey: ['community-place', id],
    queryFn: () => api<CommunityPlaceDto>(`/community/places/${id}`),
  });

  if (isLoading) return <Spinner label="Cargando…" />;
  if (isError || !p) {
    return (
      <Card className="text-sm text-red-300">
        {loadError instanceof ApiError ? loadError.message : 'No se pudo cargar.'}
      </Card>
    );
  }

  const copy = PLACE_KINDS[p.kind];
  const isOutdoor = p.kind === 'OUTDOOR_SOCIAL';
  const canEdit = Boolean(user && (user.role === 'SUPER_ADMIN' || p.createdById === user.id));
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  // Foto y galería: solo el SUPER_ADMIN o el administrador asignado.
  const canEditImages = Boolean(user && (isSuperAdmin || p.adminId === user.id));
  const img = placePhotoUrl(p);
  const mapPlace = {
    place: isOutdoor ? p.place : p.name,
    address: p.address,
    city: p.city,
    commune: p.commune,
    region: p.region,
    lat: p.lat,
    lng: p.lng,
  };
  const mapsLink = copy.hideMap ? null : mapsSearchLink(mapPlace);
  const embed = copy.hideMap ? null : mapsEmbedUrl(mapPlace);
  const pct = p.bachataPct ?? (p.styles.length > 0 ? pctFromStyles(p.styles) : null);

  const updated = (u: CommunityPlaceDto) => {
    qc.setQueryData(['community-place', id], u);
    void qc.invalidateQueries({ queryKey: ['community-places', p.kind] });
  };
  const saved = (u: CommunityPlaceDto) => {
    updated(u);
    setEditing(false);
  };

  const remove = () =>
    setConfirm({
      title: `Eliminar ${copy.one}`,
      message: (
        <>
          ¿Eliminar <span className="font-semibold">{p.name}</span>? Si solo está en pausa o
          cerró temporalmente, mejor edítalo y desmarca &quot;Activo&quot;.
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: () => {
        void deletePlace(p.id)
          .then(() => {
            void qc.invalidateQueries({ queryKey: ['community-places', p.kind] });
            router.replace(copy.listPath);
          })
          .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo eliminar.'));
      },
    });

  return (
    <div className="space-y-6">
      <div>
        <Link href={copy.listPath} className="text-sm text-neutral-400 hover:text-neutral-200">
          ← {copy.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{p.name}</h1>
          {!p.active && (
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-neutral-400">
              {copy.inactiveLabel}
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-400">
          {[placeLabel(p.city, p.commune), regionName(p.region)].filter(Boolean).join(' · ')}
        </p>
        {canEdit && (
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button type="button" variant="danger" onClick={remove}>
              Eliminar
            </Button>
          </div>
        )}
      </div>

      {error && <Card className="text-sm text-red-300">{error}</Card>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          {/* Con galería se ve la grilla 3×3; sin galería, la foto principal. */}
          {p.galleryIds.length === 0 && (
            <Card className="p-0">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={p.name} className="w-full rounded-xl" />
              ) : (
                <div className="flex h-64 items-center justify-center text-6xl">{copy.emoji}</div>
              )}
            </Card>
          )}
          {canEditImages && <MainPhotoButton place={p} onChange={updated} />}
          <PlaceGallery
            place={p}
            canEdit={canEditImages}
            onChange={updated}
          />
        </div>

        <div className="space-y-4">
          <Card className="space-y-3">
            {(p.place || p.address) && (
              <Row label={p.kind === 'DJ' ? 'Academia / colectivo' : 'Dónde'}>
                {p.place}
                {p.place && p.address && <br />}
                {p.address && <span className="text-neutral-400">{p.address}</span>}
              </Row>
            )}
            {p.schedule && <Row label={copy.scheduleLabel}>{p.schedule}</Row>}
            {pct != null && (
              <Row label="Mezcla">
                <span className="flex flex-col gap-1">
                  <StyleMixBar pct={pct} />
                  <span className="text-xs text-neutral-500">{styleMixLabel(pct)}</span>
                </span>
              </Row>
            )}
            {p.instagramHandles.length > 0 && (
              <Row label="Instagram">
                <span className="flex flex-wrap gap-1.5">
                  {p.instagramHandles.map((h) => (
                    <InstagramLink key={h} handle={h} />
                  ))}
                </span>
              </Row>
            )}
            <Row label="Agregado por">{p.createdByName}</Row>
            {p.adminName && !isSuperAdmin && <Row label="Administrador">{p.adminName}</Row>}
          </Card>

          {isSuperAdmin && <AdminAssign place={p} onChange={updated} />}

          {p.description && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-neutral-300">Descripción</h2>
              <p className="whitespace-pre-line text-sm text-neutral-300">{p.description}</p>
            </Card>
          )}

          {embed && (
            <Card className="space-y-2">
              <iframe
                title={`Mapa: ${p.name}`}
                src={embed}
                className="h-64 w-full rounded-lg border-0 bg-neutral-800"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
              {mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-brand hover:underline"
                >
                  📍 Cómo llegar
                </a>
              )}
            </Card>
          )}
        </div>
      </div>

      {editing && (
        <CommunityPlaceModal
          copy={copy}
          existing={p}
          canEditPhoto={canEditImages}
          onClose={() => setEditing(false)}
          onSaved={saved}
        />
      )}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
