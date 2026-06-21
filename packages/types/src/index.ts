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

export const TRACK_SCOPES = ['CATALOG', 'PERSONAL'] as const;
export type TrackScope = (typeof TRACK_SCOPES)[number];

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
  /** Sub-estilos (tags del vocabulario), hasta 3, a nivel de catálogo. */
  substyles: string[];
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
  /** CATALOG = base global compartida; PERSONAL = privada de un DJ. */
  scope: TrackScope;
  ownerId: string | null;
  artistUserId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** Solo en vistas de catálogo: si está en la biblioteca del usuario actual. */
  inLibrary?: boolean;
  /** Tags del usuario actual para esta canción (en "Mis Canciones"). */
  tags?: TagRef[];
  /** Datos completos de YouTube guardados (si se autocompletó). */
  details?: YoutubeDetails | null;
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

/** Todos los datos extra de YouTube que guardamos en la canción (JSON). */
export interface YoutubeDetails {
  description?: string | null;
  channelId?: string | null;
  channelTitle?: string | null;
  categoryId?: string | null;
  publishedAt?: string | null;
  tags?: string[];
  defaultAudioLanguage?: string | null;
  definition?: string | null; // hd | sd
  dimension?: string | null; // 2d | 3d
  caption?: boolean | null;
  licensedContent?: boolean | null;
  viewCount?: string | null;
  likeCount?: string | null;
  commentCount?: string | null;
  privacyStatus?: string | null;
  embeddable?: boolean | null;
  madeForKids?: boolean | null;
  license?: string | null;
  uploadStatus?: string | null;
  topicCategories?: string[];
  via: 'youtube-api' | 'oembed';
  fetchedAt: string;
}

/** Metadata extraída de un link (YouTube) para autocompletar una canción. */
export interface ExtractedTrackMetadata {
  source: TrackSource;
  sourceId: string;
  url: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  coverUrl: string | null;
  channelTitle: string | null;
  detectedStyle: DanceStyle | null;
  detectedSubstyle: DanceSubstyle | null;
  /** De dónde salió la info: API de YouTube (completa) u oEmbed (básica). */
  via: 'youtube-api' | 'oembed';
  /** Todos los datos extra disponibles (para guardar en la canción). */
  details: YoutubeDetails;
}

/** Resultado de importar una playlist de YouTube al catálogo. */
export interface PlaylistImportResult {
  total: number;
  created: number;
  updated: number;
  errors: string[];
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

/** Conteo de "Mis Canciones" por estilo (toda la biblioteca, sin filtros). */
export interface LibrarySummary {
  bachata: number;
  salsa: number;
  total: number;
}

/** Estado de conexión OAuth con YouTube del usuario actual. */
export interface YoutubeConnectionStatus {
  connected: boolean;
}

/** Resultado de crear una playlist en YouTube con el patrón 5B/3S. */
export interface YoutubePlaylistResult {
  playlistId: string;
  url: string;
  /** Total de canciones agregadas a la playlist. */
  total: number;
  /** Bachatas agregadas. */
  bachata: number;
  /** Salsas agregadas. */
  salsa: number;
  /** Canciones disponibles que quedaron fuera por el corte del patrón. */
  leftover: number;
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
// Tags (vocabulario de sub-estilos)
// ---------------------------------------------------------------------------
export interface Tag {
  id: string;
  name: string;
  slug: string;
  style: DanceStyle | null;
  /** Nº de asociaciones (canción×DJ) que usan este tag. */
  usageCount?: number;
}

/** Resumen mínimo de un tag (para chips). */
export interface TagRef {
  id: string;
  name: string;
  style: DanceStyle | null;
}

/** Sugerencia de tag para una canción: cuántos DJs lo usaron en ella. */
export interface TrackTagSuggestion extends TagRef {
  count: number;
}

export interface TrackTagsResponse {
  /** IDs de tags que el usuario actual asoció a la canción. */
  mine: string[];
  /** Tags usados en esta canción por cualquier DJ, de más a menos usado. */
  suggestions: TrackTagSuggestion[];
}

// ---------------------------------------------------------------------------
// Permisos (matriz rol × módulo × acción)
// ---------------------------------------------------------------------------
export const PERMISSION_ACTIONS = ['ver', 'editar', 'eliminar'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export interface ModulePerms {
  ver: boolean;
  editar: boolean;
  eliminar: boolean;
}

/** matriz[rol][moduleKey] = { ver, editar, eliminar }. Parcial: lo no definido cae a defaults. */
export type PermissionsMatrix = Record<string, Record<string, ModulePerms>>;

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
