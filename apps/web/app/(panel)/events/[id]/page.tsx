'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { regionName, type EventDto } from '@baile-latino/types';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  deleteEvent,
  flyerUrl,
  formFromEvent,
  formatEventDateLong,
  formatEventTime,
  replaceFlyer,
  updateEvent,
  validateForm,
  type EventFormValues,
} from '@/lib/events';
import { Button, Card, Spinner, StyleBadge } from '@/components/ui';
import { EventForm } from '@/components/event-form';
import { EventMap, eventMapsLink } from '@/components/event-map';
import { InstagramIcon, InstagramLink } from '@/components/instagram-link';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <div className="text-neutral-500">{label}</div>
      <div className="min-w-0 break-words text-neutral-200">{children}</div>
    </div>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<EventFormValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: ev, isLoading, isError, error: loadError } = useQuery({
    queryKey: ['event', id],
    queryFn: () => api<EventDto>(`/events/${id}`),
  });

  const canEdit = Boolean(
    user && ev && (user.role === 'SUPER_ADMIN' || ev.createdById === user.id),
  );

  const refresh = async (updated: EventDto) => {
    qc.setQueryData(['event', id], updated);
    await qc.invalidateQueries({ queryKey: ['events'] });
  };

  const startEdit = () => {
    if (!ev) return;
    setValues(formFromEvent(ev));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!values) return;
    const err = validateForm(values);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await refresh(await updateEvent(id, values));
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const changeFlyer = async (f: File | undefined | null) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      await refresh(await replaceFlyer(id, f));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo subir el flyer.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async () => {
    if (!ev) return;
    if (!window.confirm(`¿Eliminar "${ev.title}"? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    try {
      await deleteEvent(id);
      await qc.invalidateQueries({ queryKey: ['events'] });
      router.push('/events');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo eliminar.');
      setBusy(false);
    }
  };

  if (isLoading) return <Spinner label="Cargando evento…" />;
  if (isError || !ev) {
    return (
      <Card className="text-sm text-red-300">
        {loadError instanceof ApiError ? loadError.message : 'Evento no encontrado.'}
      </Card>
    );
  }

  const img = flyerUrl(ev);
  const cancelled = ev.status === 'CANCELLED';
  const mapsLink = eventMapsLink(ev);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/events" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Eventos
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{ev.title}</h1>
          {cancelled && (
            <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
              CANCELADO
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-400">
          {regionName(ev.region)}
          {ev.city ? ` · ${ev.city}` : ''}
        </p>
      </div>

      {error && !editing && <div className="text-sm text-red-300">{error}</div>}

      {editing && values ? (
        <Card>
          <EventForm
            values={values}
            onChange={setValues}
            onSubmit={save}
            submitLabel="Guardar cambios"
            busy={busy}
            error={error}
            showStatus
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card className="p-0">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={ev.title} className="w-full rounded-xl" />
            ) : (
              <div className="flex h-64 items-center justify-center text-5xl">📅</div>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="space-y-3">
              <Row label="Cuándo">
                <span className="capitalize">{formatEventDateLong(ev.startsAt)}</span>
                {' · '}
                {formatEventTime(ev.startsAt)}
                {ev.endsAt && ` a ${formatEventTime(ev.endsAt)}`} hrs
              </Row>
              {(ev.venueName || ev.address) && (
                <Row label="Dónde">
                  {ev.venueName}
                  {ev.venueName && ev.address && <br />}
                  {ev.address && <span className="text-neutral-400">{ev.address}</span>}
                </Row>
              )}
              {(ev.styles.length > 0 || ev.bachataPct != null) && (
                <Row label="Estilos">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {ev.styles.map((s) => (
                      <StyleBadge key={s} style={s} />
                    ))}
                    {ev.bachataPct != null && (
                      <span className="text-neutral-400">
                        {ev.bachataPct}% bachata · {100 - ev.bachataPct}% salsa
                      </span>
                    )}
                  </span>
                </Row>
              )}
              {ev.priceInfo && <Row label="Entradas">{ev.priceInfo}</Row>}
              {ev.ticketUrl && (
                <Row label="Comprar">
                  <a
                    href={ev.ticketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline"
                  >
                    {ev.ticketUrl}
                  </a>
                </Row>
              )}
              {(ev.organizerName || ev.organizerInstagram) && (
                <Row label="Organiza">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {ev.organizerName}
                    {ev.organizerInstagram && (
                      <InstagramLink handle={ev.organizerInstagram} />
                    )}
                  </span>
                </Row>
              )}
              {ev.instagramUrl && (
                <Row label="Post">
                  <a
                    href={ev.instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-pink-300 hover:text-pink-200 hover:underline"
                  >
                    <InstagramIcon className="h-4 w-4" />
                    Ver la publicación en Instagram
                  </a>
                </Row>
              )}
              {ev.description && (
                <Row label="Detalles">
                  <span className="whitespace-pre-line">{ev.description}</span>
                </Row>
              )}
              <Row label="Publicado por">
                <span className="text-neutral-400">{ev.createdByName}</span>
              </Row>
            </Card>

            {mapsLink && (
              <Card className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Cómo llegar</div>
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand hover:underline"
                  >
                    Abrir en Google Maps ↗
                  </a>
                </div>
                <EventMap ev={ev} />
              </Card>
            )}

            {canEdit && (
              <Card className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={startEdit} disabled={busy}>
                  Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                >
                  {img ? 'Cambiar flyer' : 'Subir flyer'}
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => changeFlyer(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={remove}
                  disabled={busy}
                  className="ml-auto"
                >
                  Eliminar
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
