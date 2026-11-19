import type {
  AcademyDto,
  AcademySummaryDto,
  AcademyVideoDto,
  ChileRegion,
  ClassLevel,
} from '@baile-latino/types';
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

/** El logo es público (para <Image>); la API lo cachea 1 h. */
export function academyLogoUrl(a: Pick<AcademySummaryDto, 'id' | 'hasLogo'>): string | null {
  return a.hasLogo ? `${API_BASE}/academies/${a.id}/logo` : null;
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
  /** URL firmada (1 h) para ver una foto o reproducir un video. */
  mediaUrl: (id: string, videoId: string) =>
    api<{ url: string }>(`/academies/${id}/videos/${videoId}/url`),
};
