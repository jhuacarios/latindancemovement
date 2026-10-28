import type {
  ChileRegion,
  DanceStyle,
  EventDto,
  EventStatus,
  FlyerExtraction,
} from '@baile-latino/types';
import { api, API_BASE, uploadForm } from './api';

const TZ = 'America/Santiago';

/** "vie 13 sep · 22:00" (hora de Chile). */
export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
  const time = new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${day.replace(/\.$/, '')} · ${time}`;
}

/** "viernes 13 de septiembre de 2026" */
export function formatEventDateLong(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatEventTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** ISO (UTC) → valor para <input type="datetime-local"> en la zona del navegador. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> → ISO (UTC). '' → null. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function flyerUrl(ev: Pick<EventDto, 'id' | 'hasFlyer' | 'updatedAt'>): string | null {
  if (!ev.hasFlyer) return null;
  // updatedAt como cache-buster: al reemplazar el flyer cambia la URL.
  return `${API_BASE}/events/${ev.id}/flyer?v=${encodeURIComponent(ev.updatedAt)}`;
}

/** Valores del formulario (strings para los inputs; se convierten al enviar). */
export interface EventFormValues {
  title: string;
  description: string;
  /** datetime-local */
  startsAt: string;
  endsAt: string;
  region: ChileRegion | '';
  city: string;
  venueName: string;
  address: string;
  styles: DanceStyle[];
  bachataPct: string;
  priceInfo: string;
  ticketUrl: string;
  instagramUrl: string;
  organizerName: string;
  organizerInstagram: string;
  status: EventStatus;
}

export const EMPTY_EVENT_FORM: EventFormValues = {
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
  region: '',
  city: '',
  venueName: '',
  address: '',
  styles: [],
  bachataPct: '',
  priceInfo: '',
  ticketUrl: '',
  instagramUrl: '',
  organizerName: '',
  organizerInstagram: '',
  status: 'PUBLISHED',
};

export function formFromEvent(ev: EventDto): EventFormValues {
  return {
    title: ev.title,
    description: ev.description ?? '',
    startsAt: toLocalInput(ev.startsAt),
    endsAt: toLocalInput(ev.endsAt),
    region: ev.region,
    city: ev.city ?? '',
    venueName: ev.venueName ?? '',
    address: ev.address ?? '',
    styles: ev.styles,
    bachataPct: ev.bachataPct != null ? String(ev.bachataPct) : '',
    priceInfo: ev.priceInfo ?? '',
    ticketUrl: ev.ticketUrl ?? '',
    instagramUrl: ev.instagramUrl ?? '',
    organizerName: ev.organizerName ?? '',
    organizerInstagram: ev.organizerInstagram ?? '',
    status: ev.status,
  };
}

/** Prellena el formulario con lo que leyó Claude del flyer. */
export function formFromExtraction(x: FlyerExtraction): EventFormValues {
  let startsAt = '';
  let endsAt = '';
  if (x.date) {
    startsAt = `${x.date}T${x.time ?? '22:00'}`;
    if (x.endTime) {
      // Si termina "antes" de empezar (ej. 22:00 → 03:00) es el día siguiente.
      const sameDay = `${x.date}T${x.endTime}`;
      const end = new Date(sameDay);
      if (end <= new Date(startsAt)) end.setDate(end.getDate() + 1);
      endsAt = toLocalInput(end.toISOString());
    }
  }
  return {
    title: x.title ?? '',
    description: x.description ?? '',
    startsAt,
    endsAt,
    region: x.region ?? '',
    city: x.city ?? '',
    venueName: x.venueName ?? '',
    address: x.address ?? '',
    styles: x.styles,
    bachataPct: x.bachataPct != null ? String(x.bachataPct) : '',
    priceInfo: x.priceInfo ?? '',
    ticketUrl: x.ticketUrl ?? '',
    instagramUrl: x.instagramUrl ?? '',
    organizerName: x.organizerName ?? '',
    organizerInstagram: x.organizerInstagram ?? '',
    status: 'PUBLISHED',
  };
}

/** Formulario → payload JSON de la API (CreateEventDto / UpdateEventDto). */
export function payloadFromForm(v: EventFormValues) {
  const opt = (s: string) => (s.trim() ? s.trim() : null);
  const pct = v.bachataPct.trim() === '' ? null : Number(v.bachataPct);
  return {
    title: v.title.trim(),
    description: opt(v.description),
    startsAt: fromLocalInput(v.startsAt),
    endsAt: fromLocalInput(v.endsAt),
    region: v.region || undefined,
    city: opt(v.city),
    venueName: opt(v.venueName),
    address: opt(v.address),
    styles: v.styles,
    bachataPct: pct != null && Number.isFinite(pct) ? Math.round(pct) : null,
    priceInfo: opt(v.priceInfo),
    ticketUrl: opt(v.ticketUrl),
    instagramUrl: opt(v.instagramUrl),
    organizerName: opt(v.organizerName),
    organizerInstagram: opt(v.organizerInstagram),
    status: v.status,
  };
}

/** Errores de validación del formulario (antes de llamar a la API). */
export function validateForm(v: EventFormValues): string | null {
  if (v.title.trim().length < 2) return 'Ponle un nombre al evento.';
  if (!fromLocalInput(v.startsAt)) return 'Indica fecha y hora de inicio.';
  if (!v.region) return 'Elige la región donde se realiza.';
  const end = fromLocalInput(v.endsAt);
  if (end && end <= fromLocalInput(v.startsAt)!) {
    return 'La hora de término debe ser posterior al inicio.';
  }
  return null;
}

// --- llamadas a la API --------------------------------------------------------

export function extractFlyer(file: File, text: string) {
  const fd = new FormData();
  fd.append('text', text);
  fd.append('file', file);
  return uploadForm<FlyerExtraction>('/events/extract', fd);
}

export function createEvent(values: EventFormValues, flyer: File | null) {
  const fd = new FormData();
  fd.append('data', JSON.stringify(payloadFromForm(values)));
  if (flyer) fd.append('file', flyer);
  return uploadForm<EventDto>('/events', fd);
}

export function updateEvent(id: string, values: EventFormValues) {
  return api<EventDto>(`/events/${id}`, {
    method: 'PATCH',
    body: payloadFromForm(values),
  });
}

export function replaceFlyer(id: string, flyer: File) {
  const fd = new FormData();
  fd.append('file', flyer);
  return uploadForm<EventDto>(`/events/${id}/flyer`, fd, 'PUT');
}

export function deleteEvent(id: string) {
  return api<void>(`/events/${id}`, { method: 'DELETE' });
}
