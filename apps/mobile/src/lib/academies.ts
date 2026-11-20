import type {
  AcademyDto,
  AcademySummaryDto,
  AcademyVideoDto,
  ChileRegion,
  ClassLevel,
  MyEnrollmentDto,
} from '@baile-latino/types';
import { regionName } from '@baile-latino/types';
import { API_BASE, api } from './api';

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/** Orden de la semana para el horario (lunes primero). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const LEVEL_LABEL: Record<ClassLevel, string> = {
  BASICO: 'Básico',
  INTERMEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
  TODOS: 'Todo nivel',
};

/** Cambia cuando se sube o quita un logo en esta sesión (la API y el teléfono lo cachean). */
const logoVersions = new Map<string, number>();
export function bumpLogoVersion(academyId: string): void {
  logoVersions.set(academyId, Date.now());
}

/** El logo es público (para <Image>); la API lo cachea 1 h. */
export function academyLogoUrl(a: Pick<AcademySummaryDto, 'id' | 'hasLogo'>): string | null {
  if (!a.hasLogo) return null;
  const v = logoVersions.get(a.id);
  return `${API_BASE}/academies/${a.id}/logo${v ? `?v=${v}` : ''}`;
}

/** "18:30" + 60 → "18:30–19:30". */
export function timeRange(start: string, durationMin: number): string {
  const [h, m] = start.split(':').map(Number);
  const end = h * 60 + m + durationMin;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${start}–${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
}

/** 95000 ms → "1:35". */
export function formatDuration(ms: number | null): string | null {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const academiesApi = {
  list: (region?: ChileRegion | null) =>
    api<AcademySummaryDto[]>(`/academies${region ? `?region=${region}` : ''}`),
  get: (id: string) => api<AcademyDto>(`/academies/${id}`),
  /** Galería (solo lo listo, no la bóveda). */
  media: (id: string, classId?: string | null) =>
    api<AcademyVideoDto[]>(`/academies/${id}/videos${classId ? `?classId=${classId}` : ''}`),
  enroll: (id: string, classId: string, message?: string) =>
    api<void>(`/academies/${id}/classes/${classId}/enroll`, {
      method: 'POST',
      body: { message: message?.trim() || null },
    }),
  unenroll: (id: string, classId: string) =>
    api<void>(`/academies/${id}/classes/${classId}/enroll`, { method: 'DELETE' }),
  /** Mis clases: inscripciones aceptadas y solicitudes pendientes. */
  myEnrollments: () => api<MyEnrollmentDto[]>('/academies/enrollments/mine'),
  /** URL firmada (1 h) para ver una foto o reproducir un video. */
  mediaUrl: (id: string, videoId: string) =>
    api<{ url: string }>(`/academies/${id}/videos/${videoId}/url`),
  /** Mostrar (o no) un archivo de una clase en la galería abierta de la academia. */
  setFeatured: (id: string, videoId: string, featured: boolean) =>
    api<AcademyVideoDto>(`/academies/${id}/videos/${videoId}`, { method: 'PATCH', body: { featured } }),
};

/**
 * Qué puede hacer con la galería quien la mira: subir (administra y hay plan, o es
 * SUPER_ADMIN, que no depende del plan), solo lectura por falta de plan, o nada.
 */
export function uploadMode(a: AcademyDto, superAdmin: boolean): 'none' | 'yes' | 'no-plan' {
  if (superAdmin) return 'yes';
  if (!a.myRole) return 'none';
  return a.plan?.active ? 'yes' : 'no-plan';
}

export const MEMBER_ROLE_LABEL = { OWNER: 'Director', TEACHER: 'Profesor' } as const;

/** Google Maps con la dirección de la academia (o su nombre); null si no hay dónde. */
export function academyMapsLink(a: Pick<AcademyDto, 'name' | 'address' | 'city' | 'commune' | 'region'>): string | null {
  if (!a.address && !a.city) return null;
  const q = [a.address ? a.name : null, a.address ?? a.name, a.commune || a.city, regionName(a.region), 'Chile']
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
