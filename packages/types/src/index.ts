/**
 * Tipos compartidos de la Baile Latino Platform.
 * Fuente de verdad para api, web y mobile.
 *
 * Nota: Prisma sobre SQLite (dev) NO soporta enums nativos, por lo que en el
 * schema estos campos son `String`. Estas uniones + arrays `*_VALUES` son el
 * contrato real y se usan para validar con class-validator (@IsIn).
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export const USER_ROLES = [
  'BAILARIN',
  'ORGANIZADOR',
  'PROFESOR',
  'DJ',
  'ARTISTA',
  'COREOGRAFO',
  'FILMMAKER',
  'VENUE',
  'SUPER_ADMIN',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ---------------------------------------------------------------------------
// Estilos de baile
// ---------------------------------------------------------------------------
export const DANCE_STYLES = ['BACHATA', 'SALSA'] as const;
export type DanceStyle = (typeof DANCE_STYLES)[number];

export const DANCE_SUBSTYLES = [
  'BACHATA_SENSUAL',
  'BACHATA_TRADICIONAL',
  'BACHATA_URBANA',
  'SALSA_ON1',
  'SALSA_ON2',
  'SALSA_CUBANA',
] as const;
export type DanceSubstyle = (typeof DANCE_SUBSTYLES)[number];

/** Mapa sub-estilo -> estilo padre. Útil para validar coherencia y calcular mix. */
export const SUBSTYLE_TO_STYLE: Record<DanceSubstyle, DanceStyle> = {
  BACHATA_SENSUAL: 'BACHATA',
  BACHATA_TRADICIONAL: 'BACHATA',
  BACHATA_URBANA: 'BACHATA',
  SALSA_ON1: 'SALSA',
  SALSA_ON2: 'SALSA',
  SALSA_CUBANA: 'SALSA',
};

// ---------------------------------------------------------------------------
// Música
// ---------------------------------------------------------------------------
export const TRACK_SOURCES = ['SPOTIFY', 'YOUTUBE'] as const;
export type TrackSource = (typeof TRACK_SOURCES)[number];

export const TRACK_APPROVAL_STATUSES = [
  'APROBADA',
  'PENDIENTE_APROBACION',
  'RECHAZADA',
] as const;
export type TrackApprovalStatus = (typeof TRACK_APPROVAL_STATUSES)[number];

export const PLAYLIST_STATUSES = ['BORRADOR', 'PUBLICADA', 'ARCHIVADA'] as const;
export type PlaylistStatus = (typeof PLAYLIST_STATUSES)[number];

export const PLAYLIST_VISIBILITIES = ['PUBLICA', 'SOLO_ENTRADA'] as const;
export type PlaylistVisibility = (typeof PLAYLIST_VISIBILITIES)[number];

export const SONG_REQUEST_STATUSES = [
  'PENDIENTE',
  'ACEPTADA',
  'RECHAZADA',
  'QUIZAS',
] as const;
export type SongRequestStatus = (typeof SONG_REQUEST_STATUSES)[number];

// ---------------------------------------------------------------------------
// Entidades (forma pública, serializable a JSON)
// ---------------------------------------------------------------------------
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  city: string | null;
  instagramHandle: string | null;
  styles: DanceStyle[];
  createdAt: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  style: DanceStyle;
  substyle: DanceSubstyle | null;
  bpm: number | null;
  year: number | null;
  source: TrackSource;
  sourceId: string;
  /** URL canónica reconstruida desde source + sourceId. */
  url: string;
  coverUrl: string | null;
  durationSec: number | null;
  isRelease: boolean;
  approvalStatus: TrackApprovalStatus;
  artistUserId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
  isWarmup: boolean;
  addedById: string;
  track?: Track;
}

export interface Playlist {
  id: string;
  name: string;
  eventId: string | null;
  status: PlaylistStatus;
  visibility: PlaylistVisibility;
  /** Objetivo de mezcla bachata (0-100); el resto se asume salsa. */
  targetBachataPct: number | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  items?: PlaylistItem[];
}

// ---------------------------------------------------------------------------
// Generador automático de playlists
// ---------------------------------------------------------------------------
export interface PlaylistGenerationFilters {
  /** % de bachata objetivo (0-100); el resto salsa. Default 50. */
  bachataPct?: number;
  substyles?: DanceSubstyle[];
  bpmMin?: number;
  bpmMax?: number;
  /** Duración objetivo total en minutos. */
  targetMinutes?: number;
  /** Máximo de canciones. */
  maxTracks?: number;
  /** Si true, prioriza por popularidad (solicitudes/votos). */
  byPopularity?: boolean;
  /** Solo tracks aprobados (default true). */
  onlyApproved?: boolean;
}

// ---------------------------------------------------------------------------
// Respuestas de la API (contrato cliente <-> servidor)
// Regla CLAUDE.md #5: toda respuesta al cliente se tipa aquí, nunca con
// entidades de Prisma ni con interfaces locales de un módulo.
// ---------------------------------------------------------------------------
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: { index: number; reason: string }[];
}

/** Resultado de importar canciones desde un archivo Excel. */
export interface ExcelImportResult {
  totalRows: number;
  created: number;
  updated: number;
  errors: { row: number; reason: string }[];
}

export interface PlaylistGenerationSummary {
  requested: { bachataPct: number; maxTracks: number; byPopularity: boolean };
  trackCount: number;
  bachataCount: number;
  salsaCount: number;
  actualBachataPct: number;
  estimatedMinutes: number;
}

export interface PlaylistGenerationResult {
  tracks: Track[];
  summary: PlaylistGenerationSummary;
  /** Presente solo si se pidió persistir (se envió `name`). */
  playlist: Playlist | null;
}

export interface CatalogSummary {
  totalTracks: number;
  byStyle: Record<string, number>;
  bySubstyle: Record<string, number>;
  bySource: Record<string, number>;
  byApprovalStatus: Record<string, number>;
  releases: number;
}

export interface TopTrack {
  id: string;
  title: string;
  artist: string;
  style: DanceStyle;
  requestCount: number;
}

export interface PlaylistReport {
  playlistId: string;
  name: string;
  trackCount: number;
  warmupCount: number;
  bachataCount: number;
  salsaCount: number;
  actualBachataPct: number;
  targetBachataPct: number | null;
  estimatedMinutes: number;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}
