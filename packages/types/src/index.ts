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
  /** Rol por defecto del piloto: accede a todos los módulos salvo Administración. */
  'PILOTO',
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
/** Preferencia de baile del usuario. Se le pregunta la primera vez que entra. */
export const STYLE_PREFERENCES = ['BACHATA', 'SALSA', 'AMBOS'] as const;
export type StylePreference = (typeof STYLE_PREFERENCES)[number];

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  /** Apellido(s). */
  lastName: string | null;
  /** Nombre visible / pseudónimo. Es lo que ve la comunidad; `null` = se usa `name`. */
  displayName: string | null;
  /** Cumpleaños, solo día y mes (dato personal: solo el usuario y el SUPER_ADMIN). */
  birthDay: number | null;
  birthMonth: number | null;
  /** RUT normalizado "12345678-5". Dato personal: solo para el propio usuario y el SUPER_ADMIN. */
  rut: string | null;
  role: UserRole;
  /** Ciudad (área urbana, ver `CHILE_CITIES`). */
  city: string | null;
  /** Comuna (dentro de `city`). */
  commune: string | null;
  /** Región de Chile (`ChileRegion`). */
  region: ChileRegion | null;
  instagramHandle: string | null;
  styles: DanceStyle[];
  /** Preferencia de baile. `null` = todavía no la eligió (se le pregunta). */
  stylePreference: StylePreference | null;
  createdAt: string;
  /** Tiene contraseña propia (registro por email). Si es false, es cuenta solo-social. */
  hasPassword: boolean;
  /** Cuenta vinculada con Google. */
  hasGoogle: boolean;
  /** Versión de la foto de perfil (ISO); null = sin foto. URL: `avatarPath(user)`. */
  avatarAt: string | null;
}

/** Ruta (relativa a la API) de la foto de perfil, o null si no tiene. Es pública. */
export function avatarPath(u: { id: string; avatarAt: string | null }): string | null {
  return u.avatarAt ? `/auth/users/${u.id}/avatar?v=${encodeURIComponent(u.avatarAt)}` : null;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  style: DanceStyle;
  /** Sub-estilos (tags del vocabulario), hasta 3, a nivel de catálogo. */
  substyles: string[];
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
  /** Fecha de lanzamiento (Spotify): "2024-04-04" | "2024-04" | "2024" | "". */
  releaseDate?: string | null;
  /** Spotify: ¿reproducible en el embed? false = restringida; null = desconocido. */
  spotifyPlayable?: boolean | null;
}

/** Resumen de un artista del catálogo (agregado por nombre). */
export interface ArtistSummary {
  name: string;
  /** Cuántas canciones del catálogo lo acreditan. */
  trackCount: number;
  /** Estilos en los que aparece (BACHATA / SALSA). */
  styles: DanceStyle[];
}

/**
 * Feed de descubrimiento "Nuevo y sonando": lo que más suena del catálogo de
 * YouTube (única fuente con reproducciones reales), separado por estilo. Cada
 * lista mezcla los estrenos recientes con las "épicas" (mayor momentum, sin
 * importar su fecha) y viene ya rankeada por el backend.
 */
export interface DiscoverFeed {
  bachata: Track[];
  salsa: Track[];
  /** Ids de las canciones que son "épicas", para mostrar la insignia 🔥. */
  epicIds: string[];
}

/**
 * Candidato de descubrimiento: un lanzamiento reciente en Spotify de un artista
 * que ya está en el catálogo, que AÚN no está en el catálogo. Es una sugerencia
 * para curar/agregar (no entra solo).
 */
export interface DiscoverCandidate {
  /** id del track en Spotify (para agregar al catálogo / preview). */
  spotifyTrackId: string;
  title: string;
  artist: string;
  /** "YYYY-MM-DD" | "YYYY-MM" | "YYYY" (del álbum). */
  releaseDate: string;
  coverUrl: string | null;
  /** URL del track en Spotify. */
  url: string;
  /** Preview de 30s (puede ser null). */
  previewUrl: string | null;
  /** Estilo heredado del artista semilla en nuestro catálogo. */
  style: DanceStyle;
  /** El artista de nuestro catálogo que lo trajo. */
  seedArtist: string;
  /** single | album | compilation. */
  albumType: string;
}

/**
 * Candidato de descubrimiento por YouTube: una subida reciente del CANAL de un
 * artista del catálogo, que aún no está en el catálogo. Trae un estilo
 * PROPUESTO (por el texto o heredado del canal) para que un humano confirme.
 */
export interface YoutubeDiscoverCandidate {
  videoId: string;
  title: string;
  channelTitle: string;
  /** Fecha de publicación del video (ISO). */
  publishedAt: string;
  thumbnailUrl: string | null;
  /** URL del video en YouTube. */
  url: string;
  /** Estilo propuesto (BACHATA | SALSA); null = por revisar. */
  proposedStyle: DanceStyle | null;
  /** Confianza de la clasificación. */
  confidence: 'alta' | 'media' | 'baja';
  /** Por qué se clasificó así (texto o canal). */
  reason: string;
  /** Artista del catálogo cuyo canal trajo el candidato. */
  seedArtist: string;
  /** Duración del video en segundos (null si no se pudo obtener). */
  durationSec: number | null;
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
  /** Plataforma de la playlist interna: YOUTUBE | SPOTIFY. */
  source: TrackSource;
  eventId: string | null;
  status: PlaylistStatus;
  visibility: PlaylistVisibility;
  /** Objetivo de mezcla bachata (0-100); el resto se asume salsa. */
  targetBachataPct: number | null;
  /** Patrón de distribución por bloque (si se definió al crearla). */
  bachatasPerBlock: number | null;
  salsasPerBlock: number | null;
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

/** Un grupo de canciones del catálogo detectadas como posibles duplicadas. */
export interface DuplicateGroup {
  /** Clave normalizada (artista + título) que las agrupó. */
  key: string;
  tracks: Track[];
}

/** Datos resumidos de un track de Spotify (para el matching con YouTube). */
export interface SpotifyTrackBrief {
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
}

/** Confianza del match Spotify→YouTube. */
export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

/** Un track de Spotify con sus candidatos de YouTube ya puntuados. */
export interface SpotifyImportMatch {
  spotify: SpotifyTrackBrief;
  /** Mejor candidato (el de mayor puntaje), o null si no se encontró nada. */
  best: ExtractedTrackMetadata | null;
  /** Hasta 4 candidatos ordenados por puntaje (incluye `best`). */
  candidates: ExtractedTrackMetadata[];
  confidence: MatchConfidence;
  /**
   * true si la búsqueda en YouTube falló por **cuota agotada** (no por falta de
   * match). Permite a la UI distinguirlo de un "sin resultados" real.
   */
  quotaError?: boolean;
  /**
   * true si alguno de los candidatos de YouTube ya está en el catálogo (mismo
   * video). Indica que ya subimos una versión de esta canción; la UI la marca
   * y la deja sin seleccionar por defecto para no duplicar.
   */
  inCatalog?: boolean;
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

/** Estados de una solicitud de acceso a YouTube (test user en Google). */
export const YT_ACCESS_STATUSES = ['PENDING', 'ADDED', 'REJECTED'] as const;
export type YoutubeAccessStatus = (typeof YT_ACCESS_STATUSES)[number];

/**
 * Solicitud de un usuario para que lo habiliten a conectar su YouTube. El admin
 * la revisa y, tras cargar el correo como test user en Google, la marca ADDED.
 */
export interface YoutubeAccessRequest {
  id: string;
  userId: string;
  /** Gmail con el que el usuario autorizará (puede diferir del de su login). */
  email: string;
  status: YoutubeAccessStatus;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  /** Datos del solicitante (solo en la vista de admin). */
  userName?: string;
  userLoginEmail?: string;
}

// ---------------------------------------------------------------------------
// Spotify — cuenta del usuario (OAuth) y sus playlists
// ---------------------------------------------------------------------------

/** Estado de conexión OAuth con Spotify del usuario actual. */
export interface SpotifyConnectionStatus {
  connected: boolean;
}

/** Una playlist de la cuenta de Spotify del usuario. */
export interface SpotifyOwnPlaylist {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  imageUrl: string | null;
  owner: string;
  url: string;
}

/** Match de una canción de la playlist contra nuestro catálogo/biblioteca. */
export interface SpotifyPlaylistMatch {
  trackId: string;
  style: DanceStyle;
  substyles: string[];
  durationSec: number | null;
  year: number | null;
  inCatalog: boolean;
  inLibrary: boolean;
}

/** Una canción dentro de una playlist de Spotify (con su match). */
export interface SpotifyPlaylistTrackItem {
  sourceId: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  year: number | null;
  imageUrl: string | null;
  url: string;
  match: SpotifyPlaylistMatch | null;
}

/** Detalle de una playlist de Spotify: metadatos + sus canciones. */
export interface SpotifyPlaylistDetail extends SpotifyOwnPlaylist {
  items: SpotifyPlaylistTrackItem[];
}

/** Resumen de una playlist de Spotify (para las tarjetas de la lista). */
export interface SpotifyPlaylistStats {
  itemCount: number;
  inLibrary: number;
  inCatalog: number;
  external: number;
  bachata: number;
  salsa: number;
  totalSec: number;
}

/** Qué estilo abre cada bloque del patrón. */
export type YoutubePlaylistOrder = 'bachata' | 'salsa';

/** Distribución configurable del patrón de la playlist rápida. */
export interface YoutubePlaylistPattern {
  /** Cuántas bachatas por bloque. */
  bachataPerBlock: number;
  /** Cuántas salsas por bloque. */
  salsaPerBlock: number;
  /** Qué estilo va primero en cada bloque. */
  order: YoutubePlaylistOrder;
}

/** Previsualización (sin crear): cuántas canciones tendría la playlist. */
export interface YoutubePlaylistPreview {
  total: number;
  bachata: number;
  salsa: number;
  leftover: number;
}

/** Resultado de crear una playlist en YouTube a partir de una plantilla interna. */
export interface YoutubePlaylistFromTemplateResult {
  playlistId: string;
  url: string;
  /** Videos de YouTube agregados. */
  added: number;
  /** Canciones omitidas (no eran de YouTube, ej: Spotify). */
  skipped: number;
}

/** Resultado de crear una playlist en YouTube con el patrón configurado. */
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

/** Playlist existente en la cuenta de YouTube del usuario (traída a la vista). */
export interface YoutubeOwnPlaylist {
  id: string;
  title: string;
  description: string;
  /** Cantidad de videos en la playlist. */
  itemCount: number;
  /** 'public' | 'unlisted' | 'private'. */
  privacyStatus: string;
  /** Miniatura de la playlist (o null si no tiene). */
  thumbnailUrl: string | null;
  /** Fecha de creación (ISO) o null. */
  publishedAt: string | null;
  /** Enlace directo a la playlist en YouTube. */
  url: string;
}

/** Datos de nuestro catálogo que matchean un video de la playlist (por videoId). */
export interface YoutubePlaylistVideoMatch {
  trackId: string;
  /** Artista(s) del catálogo (limpio). De la personal si existe, si no del catálogo. */
  artist: string;
  style: DanceStyle;
  substyles: string[];
  durationSec: number | null;
  year: number | null;
  /** Fecha de lanzamiento (para la píldora "Nueva"). De la personal si existe, si no del catálogo. */
  releaseDate: string | null;
  approvalStatus: TrackApprovalStatus;
  /** Si existe en el catálogo global. */
  inCatalog: boolean;
  /** Si el usuario actual la tiene en "Mis Canciones". */
  inLibrary: boolean;
  /** false si el video no permite reproducción embebida (para los botones). */
  embeddable: boolean | null;
}

/** Un video dentro de una playlist de YouTube. */
export interface YoutubePlaylistVideo {
  videoId: string;
  /** id del item DENTRO de la playlist (para poder quitarlo de YouTube). */
  playlistItemId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  /** Posición (0-based) dentro de la playlist. */
  position: number;
  /** Duración real del video en YouTube (segundos), o null si no se obtuvo. */
  durationSec: number | null;
  /** Enlace directo al video en YouTube. */
  url: string;
  /** Datos de nuestro catálogo si la canción existe (match por videoId). */
  match?: YoutubePlaylistVideoMatch | null;
}

/** Detalle de una playlist de YouTube: metadatos + sus videos. */
export interface YoutubePlaylistDetail extends YoutubeOwnPlaylist {
  items: YoutubePlaylistVideo[];
}

/** Resumen de una playlist: cuántas en cada lugar + duración total. */
export interface YoutubePlaylistStats {
  itemCount: number;
  /** En "Mis Canciones" del usuario. */
  inLibrary: number;
  /** En el catálogo global. */
  inCatalog: number;
  /** Externas: no están en el sistema (sin match). */
  external: number;
  /** Duración total (segundos) de los videos. */
  totalSec: number;
  /** true si alguna duración no se pudo obtener (el total es un mínimo). */
  partialDuration: boolean;
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

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
/** Regiones de Chile, de norte a sur. El `code` es lo que se guarda en la DB. */
export const CHILE_REGIONS = [
  { code: 'ARICA_PARINACOTA', name: 'Arica y Parinacota' },
  { code: 'TARAPACA', name: 'Tarapacá' },
  { code: 'ANTOFAGASTA', name: 'Antofagasta' },
  { code: 'ATACAMA', name: 'Atacama' },
  { code: 'COQUIMBO', name: 'Coquimbo' },
  { code: 'VALPARAISO', name: 'Valparaíso' },
  { code: 'METROPOLITANA', name: 'Metropolitana de Santiago' },
  { code: 'OHIGGINS', name: "O'Higgins" },
  { code: 'MAULE', name: 'Maule' },
  { code: 'NUBLE', name: 'Ñuble' },
  { code: 'BIOBIO', name: 'Biobío' },
  { code: 'ARAUCANIA', name: 'La Araucanía' },
  { code: 'LOS_RIOS', name: 'Los Ríos' },
  { code: 'LOS_LAGOS', name: 'Los Lagos' },
  { code: 'AYSEN', name: 'Aysén' },
  { code: 'MAGALLANES', name: 'Magallanes' },
] as const;
export type ChileRegion = (typeof CHILE_REGIONS)[number]['code'];
export const CHILE_REGION_CODES = CHILE_REGIONS.map((r) => r.code) as ChileRegion[];

export function regionName(code: string): string {
  return CHILE_REGIONS.find((r) => r.code === code)?.name ?? code;
}

export const EVENT_STATUSES = ['PUBLISHED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Evento (social, show, taller…) tal como lo devuelve la API. Sin el flyer: ese va por `/events/:id/flyer`. */
export interface EventDto {
  id: string;
  title: string;
  description: string | null;
  /** ISO 8601 (UTC). */
  startsAt: string;
  endsAt: string | null;
  region: ChileRegion;
  city: string | null;
  commune: string | null;
  venueName: string | null;
  address: string | null;
  styles: DanceStyle[];
  /** % de bachata en la noche (0-100). null = no informado. */
  bachataPct: number | null;
  /** Texto libre: "Preventa $5.000 · Puerta $7.000". */
  priceInfo: string | null;
  ticketUrl: string | null;
  instagramUrl: string | null;
  organizerName: string | null;
  organizerInstagram: string | null;
  status: EventStatus;
  hasFlyer: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

/** Sección de la lista de eventos: una región con sus eventos y el conteo de próximos. */
export interface EventsRegionSection {
  region: ChileRegion;
  name: string;
  upcomingCount: number;
  events: EventDto[];
}

export interface EventsByRegionResponse {
  sections: EventsRegionSection[];
  total: number;
  upcomingTotal: number;
}

export type ExtractionConfidence = 'high' | 'medium' | 'low';

/** Datos que Claude extrae de un flyer (+ texto opcional). Todo puede venir null. */
export interface FlyerExtraction {
  title: string | null;
  description: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:mm (24h) */
  time: string | null;
  endTime: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  commune: string | null;
  region: ChileRegion | null;
  styles: DanceStyle[];
  bachataPct: number | null;
  priceInfo: string | null;
  ticketUrl: string | null;
  instagramUrl: string | null;
  organizerName: string | null;
  organizerInstagram: string | null;
  confidence: {
    date: ExtractionConfidence;
    venue: ExtractionConfidence;
    region: ExtractionConfidence;
    prices: ExtractionConfidence;
  };
  /** Dudas o cosas que el organizador debería revisar. */
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Directorios de la comunidad: sociales al aire libre, salsotecas, DJs…
// (mismo modelo: ficha por región con horario/disponibilidad, estilos e Instagram)
// ---------------------------------------------------------------------------
export const COMMUNITY_PLACE_KINDS = ['OUTDOOR_SOCIAL', 'SALSOTECA', 'DJ'] as const;
/** Máximo de fotos en la galería de un lugar (grilla 3×3). */
export const COMMUNITY_PLACE_GALLERY_MAX = 9;
export type CommunityPlaceKind = (typeof COMMUNITY_PLACE_KINDS)[number];

/** Ficha de un directorio de la comunidad (lugar, junta o DJ), sin fecha única. */
export interface CommunityPlaceDto {
  id: string;
  kind: CommunityPlaceKind;
  name: string;
  region: ChileRegion;
  city: string | null;
  commune: string | null;
  /** Playa/parque, referencia del local, o academia/colectivo (DJ). */
  place: string | null;
  address: string | null;
  /** Punto en el mapa (sociales al aire libre). Ambos o ninguno. */
  lat: number | null;
  lng: number | null;
  /** Mezcla: % de bachata (el resto salsa). `null` = antiguo, solo con `styles`. */
  bachataPct: number | null;
  /** Texto libre: horario habitual, o disponibilidad en el caso de un DJ. */
  schedule: string | null;
  styles: DanceStyle[];
  description: string | null;
  /** Handles sin @ de las cuentas que lo organizan/anuncian. */
  instagramHandles: string[];
  hasPhoto: boolean;
  /** Galería (máx. `COMMUNITY_PLACE_GALLERY_MAX`), en orden. Imagen: `/community/places/:id/gallery/:photoId`. */
  galleryIds: string[];
  /** Administrador (lo asigna el SUPER_ADMIN): cambia la foto y la galería. */
  adminId: string | null;
  adminName: string | null;
  active: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityPlacesRegionSection {
  region: ChileRegion;
  name: string;
  count: number;
  places: CommunityPlaceDto[];
}

export interface CommunityPlacesByRegionResponse {
  sections: CommunityPlacesRegionSection[];
  total: number;
}

// ---------------------------------------------------------------------------
// Chat (mensajes directos 1 a 1 y canales de comunidades, historial permanente)
// ---------------------------------------------------------------------------
/** Datos mínimos de un usuario para mostrarlo en el chat (sin email). */
export interface ChatUser {
  id: string;
  name: string;
  role: UserRole;
  city: string | null;
  commune: string | null;
  instagramHandle: string | null;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  /** Nombre visible de quien lo envió (se muestra en los canales). */
  senderName: string;
  /** Texto; vacío si el mensaje es solo una imagen. */
  body: string;
  /** La imagen se pide aparte: GET /chat/conversations/:id/messages/:mid/image */
  hasImage: boolean;
  imageWidth: number | null;
  imageHeight: number | null;
  createdAt: string;
}

/** Datos de un canal de comunidad, para mostrarlo en el chat. */
export interface ChatChannelInfo {
  placeId: string;
  placeName: string;
  /** Foto principal del lugar (avatar del canal): `/community/places/:id/photo?v=placeUpdatedAt`. */
  placeHasPhoto: boolean;
  placeUpdatedAt: string;
  name: string;
  isGeneral: boolean;
  memberCount: number;
}

/** Datos del chat de una clase de academia. */
export interface ChatClassInfo {
  academyId: string;
  academyName: string;
  classId: string;
  /** Título de la clase. */
  title: string;
  memberCount: number;
}

export interface ChatConversationDto {
  id: string;
  kind: 'DIRECT' | 'CHANNEL' | 'CLASS';
  /** El otro participante (solo DIRECT). */
  other: ChatUser | null;
  /** El canal (solo CHANNEL). */
  channel: ChatChannelInfo | null;
  /** La clase (solo CLASS). */
  classGroup: ChatClassInfo | null;
  lastMessage: ChatMessageDto | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** Hasta cuándo leyó el otro (para el "visto"). */
  otherReadAt: string | null;
  createdAt: string;
}

export interface ChatMessagesPage {
  messages: ChatMessageDto[];
  /** Cursor para pedir mensajes más antiguos (id del más antiguo devuelto). null = no hay más. */
  nextCursor: string | null;
}

export interface ChatUnreadResponse {
  total: number;
}

// ---------------------------------------------------------------------------
// Comunidad de un lugar (canales tipo comunidades de WhatsApp)
// ---------------------------------------------------------------------------
export interface CommunityChannelDto {
  /** Id de la conversación del chat: se abre en /chat/:id. */
  id: string;
  name: string;
  description: string | null;
  isGeneral: boolean;
  memberCount: number;
  /** ¿El usuario está en este canal? */
  joined: boolean;
  /** No leídos del usuario (0 si no está). */
  unreadCount: number;
}

export interface CommunityDto {
  placeId: string;
  isMember: boolean;
  memberCount: number;
  /** ¿Puede crear/editar/borrar canales? (administrador del lugar o SUPER_ADMIN) */
  canManage: boolean;
  /** General primero; luego por nombre. Se listan aunque no estés (para unirte). */
  channels: CommunityChannelDto[];
}

// ─── Módulo Estudio (análisis musical) ──────────────────────────────────────
// Tiempos dentro de la canción siempre en milisegundos enteros, en la línea de
// tiempo del archivo del usuario.

export const ANALYSIS_STATUSES = ['PENDING', 'PROCESSING', 'DONE', 'ERROR'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

/** Estado del archivo, tal como lo ve el usuario. */
export const AUDIO_FILE_STATUSES = ['UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'ERROR'] as const;
export type AudioFileStatus = (typeof AUDIO_FILE_STATUSES)[number];

export const SONG_SECTION_TYPES = [
  'INTRO',
  'VERSO',
  'CORO',
  'DERECHO',
  'MAJAO',
  /** Salsa: coro-pregón (coro y sonero se turnan). */
  'MONTUNO',
  'MAMBO',
  /** Salsa: solo instrumental (timbal, congas…). */
  'SOLO',
  'PUENTE',
  'OUTRO',
  'OTRO',
] as const;
export type SongSectionType = (typeof SONG_SECTION_TYPES)[number];

export const SONG_MARKER_TYPES = ['BREAK', 'ACENTO', 'CORTE', 'NOTA'] as const;
export type SongMarkerType = (typeof SONG_MARKER_TYPES)[number];

export const MARK_ORIGINS = ['AUTOMATICO', 'MANUAL'] as const;
export type MarkOrigin = (typeof MARK_ORIGINS)[number];

/** Formatos de audio aceptados en Estudio. */
export const STUDIO_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/flac',
  'audio/x-flac',
] as const;

/** Tiempos de una frase de bachata (2 compases de 4). */
export const BEATS_PER_PHRASE = 8;

/**
 * Instrumentos cuya actividad se mide. La percusión (güira, bongó, tumba) es una
 * aproximación por bandas de frecuencia; "other" junta teclados, sintes y el resto.
 */
/**
 * Instrumentos cuya actividad se mide. "vocals" = voz principal (sin coros);
 * "guitar" = todas las guitarras juntas (requinto + segunda); "keys" = teclados y sintes.
 */
export const INSTRUMENT_KEYS = [
  'vocals',
  'coros',
  'guitar',
  'requinto',
  'segunda',
  'bass',
  'guira',
  'bongo',
  'campana',
  /** Congas (tumbadoras) de salsa. */
  'conga',
  'tumba',
  'keys',
  'other',
] as const;
export type InstrumentKey = (typeof INSTRUMENT_KEYS)[number];

/**
 * Pistas separadas que se guardan para el mezclador. "vocals" = voz principal;
 * "drums" = percusión sin la campana; "other" = lo que no es ninguna de las demás.
 */
export const STEM_KEYS = [
  'vocals',
  'coros',
  'requinto',
  'segunda',
  'bass',
  'drums',
  'campana',
  'keys',
  'other',
] as const;
export type StemKey = (typeof STEM_KEYS)[number];

/** URLs firmadas (de corta duración) de las pistas del mezclador. */
export type StemUrls = Record<StemKey, string>;

/** Actividad 0..1 de cada instrumento, un valor cada `stepMs`. */
export interface SongInstruments {
  stepMs: number;
  /** Análisis de versiones anteriores pueden no traer los instrumentos más nuevos. */
  tracks: Partial<Record<InstrumentKey, number[]>>;
}

/** Fila de la lista de audios del usuario. */
export interface AudioFileSummary {
  id: string;
  /** Estilo con que se estudia (define las reglas de secciones). */
  style: DanceStyle;
  originalName: string;
  status: AudioFileStatus;
  error: string | null;
  durationMs: number | null;
  bpm: number | null;
  trackId: string | null;
  createdAt: string;
}

export interface SongEnergy {
  stepMs: number;
  values: number[]; // 0..1
}

export interface SongSectionDto {
  id: string;
  type: SongSectionType;
  startMs: number;
  endMs: number;
  label: string | null;
  origin: MarkOrigin;
}

export interface SongMarkerDto {
  id: string;
  type: SongMarkerType;
  timeMs: number;
  text: string | null;
  origin: MarkOrigin;
}

/** Vista de estudio de una canción: el análisis compartido + la capa del usuario, ya combinados. */
export interface SongStudy extends AudioFileSummary {
  analyzerVersion: string | null;
  beatsMs: number[];
  downbeatsMs: number[];
  /** El "1" efectivo: el corregido por el usuario o, si no hay, el automático. */
  firstBeatOffsetMs: number | null;
  /** true si el "1" lo corrigió el usuario. */
  firstBeatCorrected: boolean;
  /** Índice en `beatsMs` del "1" de cada frase de 8. */
  phraseStartIndexes: number[];
  energy: SongEnergy | null;
  /** Estado de la detección de instrumentos (null = no aplica a este estilo). */
  instrumentsStatus: AnalysisStatus | null;
  instruments: SongInstruments | null;
  /** Pistas para el mezclador: null = no se pidieron (son privadas de este archivo). */
  stemsStatus: AnalysisStatus | null;
  /**
   * Secciones: las del usuario y, si no marcó ninguna, las automáticas (derivadas
   * de los instrumentos, con `origin: 'AUTOMATICO'` e id `auto-N`).
   */
  sections: SongSectionDto[];
  markers: SongMarkerDto[];
}

/** Respuesta al pedir una subida: el navegador sube el archivo directo al storage. */
export interface StudioUploadTicket {
  audioFileId: string;
  uploadUrl: string;
  /** Headers que el PUT debe llevar tal cual (la firma los incluye). */
  uploadHeaders: Record<string, string>;
}

// --- Academias ---------------------------------------------------------------

export const ACADEMY_MEMBER_ROLES = ['OWNER', 'TEACHER'] as const;
export type AcademyMemberRole = (typeof ACADEMY_MEMBER_ROLES)[number];

export const CLASS_LEVELS = ['BASICO', 'INTERMEDIO', 'AVANZADO', 'TODOS'] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];

/** Formatos de video que se pueden subir (se reproducen tal cual, sin convertir). */
export const ACADEMY_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export type AcademyVideoMimeType = (typeof ACADEMY_VIDEO_MIME_TYPES)[number];
export const ACADEMY_VIDEO_MAX_BYTES = 3 * 1024 * 1024 * 1024;
/** Fotos de la academia (van en la misma galería que los videos). */
export const ACADEMY_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACADEMY_PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const ACADEMY_MEDIA_MIME_TYPES = [...ACADEMY_VIDEO_MIME_TYPES, ...ACADEMY_PHOTO_MIME_TYPES] as const;
export type AcademyMediaKind = 'VIDEO' | 'PHOTO';
/** GALLERY = se ve y reproduce; VAULT = bóveda (almacenamiento barato, solo se descarga). */
export type AcademyMediaLocation = 'GALLERY' | 'VAULT';
/**
 * Versión compatible (MP4 H.264, color normal, máx. 1080p) que se genera de los
 * videos que no todos los navegadores reproducen (HEVC/HDR del iPhone).
 */
export type AcademyCompatStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'NOT_NEEDED' | 'TOO_LONG' | 'ERROR';
/** Solo se convierten videos de hasta esta duración. */
export const ACADEMY_COMPAT_MAX_MINUTES = 15;

/**
 * Plan Director: la suscripción de la academia (la paga el dueño, que se muestra
 * como "Director"). Trae el cupo de la galería y de la bóveda. Sin plan vigente la
 * academia queda en solo lectura: se ve y se descarga, pero no se sube ni se mueve.
 */
export const ACADEMY_PLAN_NAME = 'Plan Director';
export const ACADEMY_PLAN_STORAGE_GB = 50;
export const ACADEMY_PLAN_VAULT_GB = 200;

export interface AcademyPlanDto {
  active: boolean;
  /** ISO; null = nunca se activó. */
  expiresAt: string | null;
}

export interface AcademySummaryDto {
  id: string;
  name: string;
  region: ChileRegion;
  city: string | null;
  commune: string | null;
  styles: DanceStyle[];
  instagramHandle: string | null;
  hasLogo: boolean;
  classCount: number;
  videoCount: number;
  /** Rol del usuario actual en la academia (null si no la administra). */
  myRole: AcademyMemberRole | null;
}

export interface AcademyMemberDto {
  userId: string;
  name: string;
  email: string;
  role: AcademyMemberRole;
}

export interface AcademyClassDto {
  id: string;
  title: string;
  style: DanceStyle | null;
  level: ClassLevel;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  /** "HH:mm". */
  startTime: string;
  durationMin: number;
  teacherName: string | null;
  place: string | null;
  priceInfo: string | null;
  description: string | null;
  active: boolean;
  /** Cupo máximo de alumnos (null = sin cupo). */
  capacity: number | null;
  /** Alumnos aceptados. */
  enrolledCount: number;
  /** Solicitudes pendientes (solo para el director; 0 para el resto). */
  pendingCount: number;
  /** Estado de la inscripción del usuario actual (null = no pidió). */
  myEnrollment: AcademyEnrollmentStatus | null;
  /** Chat de la clase (solo si el usuario está inscrito o la administra). */
  chatId: string | null;
}

export const ACADEMY_ENROLLMENT_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type AcademyEnrollmentStatus = (typeof ACADEMY_ENROLLMENT_STATUSES)[number];

/** Una solicitud/inscripción, como la ve el director. */
export interface AcademyEnrollmentDto {
  id: string;
  classId: string;
  classTitle: string;
  weekday: number;
  startTime: string;
  userId: string;
  /** Nombre visible del alumno. */
  userName: string;
  instagramHandle: string | null;
  status: AcademyEnrollmentStatus;
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Mis clases (perfil del alumno). */
export interface MyEnrollmentDto {
  id: string;
  academyId: string;
  academyName: string;
  academyHasLogo: boolean;
  classId: string;
  classTitle: string;
  weekday: number;
  startTime: string;
  status: AcademyEnrollmentStatus;
  chatId: string | null;
}

export interface AcademyDto extends AcademySummaryDto {
  address: string | null;
  description: string | null;
  classes: AcademyClassDto[];
  /** Solo para quienes la administran (vacío para el resto). */
  members: AcademyMemberDto[];
  /** Uso de la galería y de la bóveda (solo para quienes la administran; null para el resto). */
  storage: { usedBytes: number; quotaBytes: number; vaultUsedBytes: number; vaultQuotaBytes: number } | null;
  /** Plan Director (solo para quienes la administran; null para el resto). */
  plan: AcademyPlanDto | null;
  /** Solicitudes de inscripción pendientes en todas sus clases (solo director; 0 para el resto). */
  pendingEnrollments: number;
  createdAt: string;
}

/** Fila de Admin → Academias (SUPER_ADMIN): plan y cupos de cada academia. */
export interface AcademyAdminRowDto {
  id: string;
  name: string;
  city: string | null;
  commune: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  plan: AcademyPlanDto;
  storage: { usedBytes: number; quotaBytes: number; vaultUsedBytes: number; vaultQuotaBytes: number };
  createdAt: string;
}

/** Un video o una foto de la galería de la academia. */
export interface AcademyVideoDto {
  id: string;
  academyId: string;
  kind: AcademyMediaKind;
  location: AcademyMediaLocation;
  /** Cuándo se movió a la bóveda (null si está en la galería). */
  vaultedAt: string | null;
  /** Versión compatible MP4 (solo videos de la galería; null = todavía sin revisar). */
  compat: { status: AcademyCompatStatus | null; sizeBytes: number | null };
  classId: string | null;
  classTitle: string | null;
  title: string;
  description: string | null;
  style: DanceStyle | null;
  /** YYYY-MM-DD. */
  recordedOn: string | null;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  /** URL firmada de la miniatura (dura 1 h), o null. */
  thumbUrl: string | null;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
}

/** Respuesta al pedir subir un video: el navegador sube el video y la miniatura directo al storage. */
export interface AcademyVideoUploadTicket {
  videoId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  thumbUploadUrl: string;
  thumbUploadHeaders: Record<string, string>;
}

/** PUBLIC = cualquiera con el link; MEMBERS = solo miembros de la academia (futuro). */
export type AcademyShareAccess = 'PUBLIC' | 'MEMBERS';

/** Link activo para compartir las fotos y videos de una clase. */
export interface AcademyShareLinkDto {
  id: string;
  token: string;
  classId: string;
  access: AcademyShareAccess;
  createdByName: string;
  createdAt: string;
}

/** Lo que ve quien abre un link compartido (sin cuenta). */
export interface SharedClassDto {
  academy: {
    id: string;
    name: string;
    hasLogo: boolean;
    city: string | null;
    commune: string | null;
    region: ChileRegion;
    instagramHandle: string | null;
  };
  class: Pick<AcademyClassDto, 'id' | 'title' | 'style' | 'level' | 'weekday' | 'startTime' | 'durationMin' | 'teacherName'>;
  items: AcademyVideoDto[];
}

export interface AcademyVideoReportDto {
  id: string;
  videoId: string;
  videoTitle: string;
  academyId: string;
  academyName: string;
  reporterName: string;
  reason: string;
  createdAt: string;
}

export * from './phrases';
export * from './chile';
export * from './style-mix';
export * from './rut';

/**
 * Normaliza una cuenta de Instagram escrita a mano: "@Cuenta", "instagram.com/cuenta/"
 * o el link completo → "cuenta". `null` si queda vacía o no es un usuario válido
 * (letras, números, punto y guion bajo; máx. 30).
 */
export function normalizeInstagramHandle(raw: string): string | null {
  const h = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

/** Nombre que ve la comunidad: el pseudónimo si lo tiene; si no, el nombre. */
export function publicName(u: { name: string; displayName?: string | null }): string {
  return u.displayName?.trim() || u.name;
}
export * from './birthday';

// ---------------------------------------------------------------------------
// Admin → Almacenamiento (para vigilar los límites del plan)
// ---------------------------------------------------------------------------
export interface StorageTableDto {
  /** Nombre de la tabla en la DB. */
  table: string;
  /** Qué guarda, en español. */
  label: string;
  bytes: number;
  rows: number;
}

export interface StorageGroupDto {
  label: string;
  bytes: number;
  count: number;
}

export interface StorageBucketDto {
  key: 'studio' | 'media';
  label: string;
  /** Nombre del bucket; null si no está configurado. */
  bucket: string | null;
  configured: boolean;
  totalBytes: number;
  objectCount: number;
  /** Clase STANDARD (cuenta para la capa gratis de R2). */
  standardBytes: number;
  /** Clase STANDARD_IA (bóveda: más barata, sin capa gratis). */
  infrequentBytes: number;
  groups: StorageGroupDto[];
  /** Se cortó el listado por cantidad de objetos (el total es un mínimo). */
  truncated: boolean;
  error: string | null;
}

export interface StorageLimits {
  /** Límite del volumen de Postgres (GB), según el plan de Railway. */
  dbGb: number;
  /** Capa gratis / presupuesto de R2 Standard (GB). */
  r2Gb: number;
}

export interface StorageReportDto {
  generatedAt: string;
  limits: StorageLimits;
  database: {
    totalBytes: number;
    /** Tablas más pesadas, de mayor a menor. */
    tables: StorageTableDto[];
  };
  buckets: StorageBucketDto[];
  /** Costo mensual estimado de R2 en US$ (Standard sobre la capa gratis + bóveda). */
  r2EstimatedUsd: number;
}

// ---------------------------------------------------------------------------
// Fotos y videos de los sociales (mismo esquema que las academias: galería + bóveda)
// ---------------------------------------------------------------------------
/** Versión gratis: cupos por defecto de cada social (editables por el SUPER_ADMIN). */
export const PLACE_MEDIA_FREE_QUOTA_MB = 5 * 1024;
export const PLACE_VAULT_FREE_QUOTA_MB = 20 * 1024;

export interface PlaceMediaDto {
  id: string;
  placeId: string;
  kind: AcademyMediaKind;
  location: AcademyMediaLocation;
  title: string;
  description: string | null;
  /** YYYY-MM-DD: día del social. */
  recordedOn: string | null;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  /** URL firmada de la miniatura (1 h), o null. */
  thumbUrl: string | null;
  uploadedByName: string;
  createdAt: string;
}

export interface PlaceMediaStorage {
  usedBytes: number;
  quotaBytes: number;
  vaultUsedBytes: number;
  vaultQuotaBytes: number;
}

/** GET /community/places/:id/media — solo miembros de la comunidad (o quien la administra). */
export interface PlaceMediaListDto {
  /** Lo de la galería, listo (no la bóveda). */
  items: PlaceMediaDto[];
  /** ¿Puede subir, borrar y mover a la bóveda? (administrador o SUPER_ADMIN) */
  canManage: boolean;
  /** Uso y cupos (solo para quien administra; null para el resto). */
  storage: PlaceMediaStorage | null;
}

export interface PlaceMediaUploadTicket {
  mediaId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  thumbUploadUrl: string;
  thumbUploadHeaders: Record<string, string>;
}
