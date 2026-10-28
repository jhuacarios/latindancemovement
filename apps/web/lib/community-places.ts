import type {
  ChileRegion,
  CommunityPlaceDto,
  CommunityPlaceKind,
  DanceStyle,
} from '@baile-latino/types';
import { api, API_BASE, uploadForm } from './api';

/** Textos de cada tipo de lugar (título, etiquetas del formulario, etc.). */
export interface PlaceKindCopy {
  kind: CommunityPlaceKind;
  emoji: string;
  title: string;
  intro: string;
  /** Singular/plural para "(N …)" en cada región. */
  one: string;
  many: string;
  addLabel: string;
  namePlaceholder: string;
  placeLabel: string;
  placePlaceholder: string;
  addressPlaceholder: string;
  scheduleLabel: string;
  schedulePlaceholder: string;
  descriptionPlaceholder: string;
  /** Clave de permiso para agregar (ver lib/modules.ts). */
  createPermKey: string;
  /** Ocultar el campo dirección (ej. DJs). */
  hideAddress?: boolean;
  /** Ocultar el botón "Cómo llegar". */
  hideMap?: boolean;
  /** Etiqueta del estado inactivo en la tarjeta. */
  inactiveLabel: string;
}

export const PLACE_KINDS: Record<CommunityPlaceKind, PlaceKindCopy> = {
  OUTDOOR_SOCIAL: {
    kind: 'OUTDOOR_SOCIAL',
    emoji: '🌴',
    title: 'Sociales al aire libre',
    intro:
      'Juntas recurrentes en playas, parques y plazas, por región. Sigue las cuentas de cada uno para enterarte de la próxima.',
    one: 'social',
    many: 'sociales',
    addLabel: 'Agregar social',
    namePlaceholder: 'Social de playa en Reñaca',
    placeLabel: 'Lugar (playa, parque, plaza…)',
    placePlaceholder: 'Playa Reñaca, frente al Sheraton',
    addressPlaceholder: 'Av. Borgoño 14000',
    scheduleLabel: 'Cuándo se junta',
    schedulePlaceholder: 'Domingos desde las 17:00 (si no llueve)',
    descriptionPlaceholder:
      'Cómo funciona, si hay parlante, si es gratis, qué llevar…',
    createPermKey: 'community.outdoor.create',
    inactiveLabel: 'EN PAUSA',
  },
  SALSOTECA: {
    kind: 'SALSOTECA',
    emoji: '🪩',
    title: 'Salsotecas',
    intro:
      'Locales donde se baila salsa y bachata toda la semana, por región. Sigue sus cuentas para ver la programación.',
    one: 'salsoteca',
    many: 'salsotecas',
    addLabel: 'Agregar salsoteca',
    namePlaceholder: 'Salsoteca Tierra Dura',
    placeLabel: 'Referencia (piso, edificio, sector…)',
    placePlaceholder: '3er piso, Edificio El Huevo',
    addressPlaceholder: 'Av. Vicuña Mackenna 1459',
    scheduleLabel: 'Horario habitual',
    schedulePlaceholder: 'Jueves a sábado desde las 22:00',
    descriptionPlaceholder:
      'Qué noches son de bachata, si hay clase previa, cover, estacionamiento…',
    createPermKey: 'community.salsotecas.create',
    inactiveLabel: 'CERRADO',
  },
  DJ: {
    kind: 'DJ',
    emoji: '🎧',
    title: 'DJs disponibles',
    intro:
      'DJs de bachata y salsa que puedes contratar para tu social o evento, por región. Contáctalos por Instagram.',
    one: 'DJ',
    many: 'DJs',
    addLabel: 'Agregar DJ',
    namePlaceholder: 'DJ Óscar Urrutia',
    placeLabel: 'Academia o colectivo (opcional)',
    placePlaceholder: 'Social de Otro Planeta',
    addressPlaceholder: '',
    scheduleLabel: 'Disponibilidad',
    schedulePlaceholder: 'Fines de semana · se mueve entre Viña y Santiago',
    descriptionPlaceholder:
      'Qué estilos mezcla, años de experiencia, equipos propios, sociales donde ha tocado…',
    createPermKey: 'music.djs.create',
    hideAddress: true,
    hideMap: true,
    inactiveLabel: 'NO DISPONIBLE',
  },
};

export function placePhotoUrl(
  s: Pick<CommunityPlaceDto, 'id' | 'hasPhoto' | 'updatedAt'>,
): string | null {
  if (!s.hasPhoto) return null;
  return `${API_BASE}/community/places/${s.id}/photo?v=${encodeURIComponent(s.updatedAt)}`;
}

export interface CommunityPlaceFormValues {
  name: string;
  region: ChileRegion | '';
  city: string;
  place: string;
  address: string;
  schedule: string;
  styles: DanceStyle[];
  description: string;
  /** Un handle por línea o separados por coma/espacio; se normaliza al enviar. */
  instagramHandles: string;
  active: boolean;
}

export const EMPTY_PLACE_FORM: CommunityPlaceFormValues = {
  name: '',
  region: '',
  city: '',
  place: '',
  address: '',
  schedule: '',
  styles: [],
  description: '',
  instagramHandles: '',
  active: true,
};

export function formFromPlace(s: CommunityPlaceDto): CommunityPlaceFormValues {
  return {
    name: s.name,
    region: s.region,
    city: s.city ?? '',
    place: s.place ?? '',
    address: s.address ?? '',
    schedule: s.schedule ?? '',
    styles: s.styles,
    description: s.description ?? '',
    instagramHandles: s.instagramHandles.map((h) => `@${h}`).join('\n'),
    active: s.active,
  };
}

/** "@uno, dos\n@tres" → ["uno", "dos", "tres"] (sin @, sin duplicados). */
export function parseHandles(raw: string): string[] {
  const out: string[] = [];
  for (const tok of raw.split(/[\s,;]+/)) {
    const h = tok
      .trim()
      .replace(/^@/, '')
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

export function payloadFromPlaceForm(v: CommunityPlaceFormValues) {
  const opt = (s: string) => (s.trim() ? s.trim() : null);
  return {
    name: v.name.trim(),
    region: v.region || undefined,
    city: opt(v.city),
    place: opt(v.place),
    address: opt(v.address),
    schedule: opt(v.schedule),
    styles: v.styles,
    description: opt(v.description),
    instagramHandles: parseHandles(v.instagramHandles),
    active: v.active,
  };
}

export function validatePlaceForm(v: CommunityPlaceFormValues): string | null {
  if (v.name.trim().length < 2) return 'Ponle un nombre.';
  if (!v.region) return 'Elige la región.';
  const bad = parseHandles(v.instagramHandles).find(
    (h) => !/^[a-z0-9._]{1,30}$/.test(h),
  );
  if (bad) return `"${bad}" no parece un usuario de Instagram válido.`;
  return null;
}

// --- API -----------------------------------------------------------------------

export function createPlace(
  kind: CommunityPlaceKind,
  v: CommunityPlaceFormValues,
  photo: File | null,
) {
  const fd = new FormData();
  fd.append('data', JSON.stringify({ kind, ...payloadFromPlaceForm(v) }));
  if (photo) fd.append('file', photo);
  return uploadForm<CommunityPlaceDto>('/community/places', fd);
}

export function updatePlace(id: string, v: CommunityPlaceFormValues) {
  return api<CommunityPlaceDto>(`/community/places/${id}`, {
    method: 'PATCH',
    body: payloadFromPlaceForm(v),
  });
}

export function replacePlacePhoto(id: string, photo: File) {
  const fd = new FormData();
  fd.append('file', photo);
  return uploadForm<CommunityPlaceDto>(`/community/places/${id}/photo`, fd, 'PUT');
}

export function deletePlace(id: string) {
  return api<void>(`/community/places/${id}`, { method: 'DELETE' });
}
