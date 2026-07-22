import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Track as PrismaTrack } from '@prisma/client';
import { DANCE_STYLES } from '@baile-latino/types';
import type {
  ArtistSummary,
  DanceStyle,
  DiscoverCandidate,
  DiscoverFeed,
  LibrarySummary,
  DuplicateGroup,
  ExtractedTrackMetadata,
  ImportResult,
  Paginated,
  PlaylistImportResult,
  Track,
  TrackSource,
  YoutubeDiscoverCandidate,
} from '@baile-latino/types';
import { PrismaService } from '../../prisma/prisma.service';
import { parseTrackLink } from '../track-url.util';
import { normalizeSearch } from '../search.util';
import { toPublicTrack } from '../mappers';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackDto } from './dto/update-track.dto';
import { QueryTracksDto } from './dto/query-tracks.dto';
import { SpotifyService } from './spotify.service';
import { YoutubeMetadataService } from './youtube-metadata.service';

/** Adornos típicos a ignorar al detectar duplicados (incluye "en vivo", "demo"). */
const DUP_NOISE =
  /\b(official|oficial|video|videoclip|audio|lyric|lyrics|letra|hd|hq|4k|8k|mv|en\s*vivo|live|directo|concierto|remaster\w*|remasterizad\w*|version|cover|demo|visualizer|extended|radio\s*edit)\b/g;

/** Normaliza título/artista para comparar duplicados (sin acentos, adornos, etc.). */
function normForDup(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // (...) [...]
    .replace(DUP_NOISE, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ') // artistas invitados
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Dos nombres de artista (ya normalizados) que son el mismo: idénticos o uno
 * prefijo del otro ("fresto" / "fresto music"). Solo se usa comparando temas con
 * el MISMO título, donde un prefijo así es el mismo artista con otro credit.
 */
function sameArtist(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

/** Minúsculas sin acentos (para detectar palabras de género en texto libre). */
function lowerNoAccents(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Título autogenerado de livestream/estado ("23 de junio de 2026") o vacío. */
function isJunkTitle(title: string): boolean {
  const s = (title ?? '').trim();
  if (s.length < 3) return true;
  return /^\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}$/i.test(s);
}

/** Clasifica el estilo de un video por su texto; si no, hereda del canal. */
function classifyStyle(
  title: string,
  description: string,
  baseStyle: DanceStyle,
  channelName: string,
): { style: DanceStyle | null; confidence: 'alta' | 'media' | 'baja'; reason: string } {
  const text = lowerNoAccents(`${title} ${description}`);
  const hasBachata = /\bbachata\b/.test(text);
  const hasSalsa = /\bsalsa\b/.test(text);
  if (hasBachata && !hasSalsa)
    return { style: 'BACHATA', confidence: 'alta', reason: 'menciona "bachata" en el texto' };
  if (hasSalsa && !hasBachata)
    return { style: 'SALSA', confidence: 'alta', reason: 'menciona "salsa" en el texto' };
  if (hasBachata && hasSalsa)
    return { style: null, confidence: 'baja', reason: 'menciona bachata y salsa — revisar' };
  return { style: baseStyle, confidence: 'media', reason: `heredado del canal (${channelName})` };
}

/** Separa "A, B & C" en nombres sueltos de artista (para semillas de búsqueda). */
function splitArtistNames(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/,|&|\/| feat\.?| ft\.?| featuring |\bvs\.?\b| x /i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parsea "YYYY-MM-DD" | "YYYY-MM" | "YYYY" a Date (día/mes faltante → 1). */
function parseReleaseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
  if (/^\d{4}$/.test(s)) return new Date(Number(s), 0, 1);
  return null;
}

@Injectable()
export class TracksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spotify: SpotifyService,
    private readonly youtube: YoutubeMetadataService,
  ) {}

  /** Caché del descubrimiento de candidatos (es pesado: muchas llamadas a Spotify). */
  private candidatesCache: {
    key: string;
    exp: number;
    data: DiscoverCandidate[];
  } | null = null;

  /** Caché del descubrimiento por YouTube (muchas llamadas a la API de YouTube). */
  private ytCandidatesCache: {
    key: string;
    exp: number;
    data: YoutubeDiscoverCandidate[];
  } | null = null;

  /**
   * Rellena la duración faltante de canciones de YouTube consultando la YouTube
   * Data API (contentDetails). Devuelve cuántas se actualizaron. Idempotente.
   */
  private async fillYoutubeDurations(
    rows: { id: string; sourceId: string }[],
  ): Promise<number> {
    if (!rows.length) return 0;
    const metas = await this.youtube.fetchByIds(rows.map((r) => r.sourceId));
    const bySource = new Map(metas.map((m) => [m.sourceId, m.durationSec]));
    let updated = 0;
    for (const r of rows) {
      const d = bySource.get(r.sourceId);
      if (d != null) {
        await this.prisma.track.update({
          where: { id: r.id },
          data: { durationSec: d },
        });
        updated++;
      }
    }
    return updated;
  }

  /** Extrae "YYYY-MM-DD" del publishedAt (fecha de subida) guardado en ytMetadata. */
  private publishedDateFromMeta(raw: string | null): string | null {
    if (!raw) return null;
    try {
      const meta = JSON.parse(raw) as { publishedAt?: string | null };
      const p = meta.publishedAt;
      return p && /^\d{4}-\d{2}-\d{2}/.test(p) ? p.slice(0, 10) : null;
    } catch {
      return null;
    }
  }

  /**
   * Para YouTube la "fecha" del catálogo es la fecha de SUBIDA del video
   * (publishedAt) — así se usa para estadísticas/indicadores. Devuelve
   * "YYYY-MM-DD" o null si no hay.
   */
  private youtubeReleaseAtCreate(
    publishedAt: string | null,
  ): string | null {
    return publishedAt && /^\d{4}-\d{2}-\d{2}/.test(publishedAt)
      ? publishedAt.slice(0, 10)
      : null;
  }

  /**
   * Rellena `releaseDate` faltante. Las que estén en Spotify usan su
   * `release_date` (con la precisión que dé Spotify): las de fuente Spotify por
   * ID (exacto), las de YouTube por búsqueda título+artista. Las que no aparezcan
   * en Spotify caen a la fecha de subida de YouTube (`publishedAt`); si tampoco,
   * al año; si no hay nada, se marca "" para no reintentar. Procesa hasta `limit`
   * por llamada (las búsquedas a Spotify son secuenciales). Idempotente.
   */
  async backfillReleaseDates(
    limit = 40,
  ): Promise<{ updated: number; remaining: number }> {
    let budget = limit;
    let updated = 0;

    const setDate = async (id: string, value: string) => {
      await this.prisma.track.update({
        where: { id },
        data: { releaseDate: value },
      });
      updated++;
    };

    // 1) Canciones de Spotify: fecha completa desde el embed (confiable, sin
    // rate limit como la Web API). Si el embed no la da, cae al año.
    const sp = await this.prisma.track.findMany({
      where: { source: 'SPOTIFY', releaseDate: null },
      select: { id: true, sourceId: true, year: true },
      take: budget,
    });
    for (const t of sp) {
      if (budget <= 0) break;
      budget--;
      const info = await this.spotify.getTrackEmbedInfo(t.sourceId);
      await setDate(
        t.id,
        info.releaseDate ?? (t.year != null ? String(t.year) : ''),
      );
    }

    // 2) Canciones de YouTube: Spotify con mes; si no, fecha de subida de
    // YouTube (que sí tiene mes); si tampoco, el año que dé Spotify o el propio.
    if (budget > 0) {
      const yt = await this.prisma.track.findMany({
        where: { source: 'YOUTUBE', releaseDate: null },
        select: { id: true, year: true, ytMetadata: true },
        take: budget,
      });
      for (const t of yt) {
        if (budget <= 0) break;
        budget--;
        // YouTube: la fecha es la de SUBIDA del video (para estadísticas). Si no
        // hay publishedAt, cae al año.
        const uploaded = this.publishedDateFromMeta(t.ytMetadata);
        await setDate(t.id, uploaded ?? (t.year != null ? String(t.year) : ''));
      }
    }

    const remaining = await this.prisma.track.count({
      where: { releaseDate: null },
    });
    return { updated, remaining };
  }

  /**
   * Construye un patch que SOLO rellena campos vacíos de una canción existente;
   * nunca pisa valores ya presentes (protege la curación manual). title y style
   * no se incluyen porque una canción existente siempre los tiene.
   */
  private fillEmptyPatch(
    existing: {
      year: number | null;
      coverUrl: string | null;
      durationSec: number | null;
      ytMetadata: string | null;
      substyle: string | null;
      artist: string | null;
    },
    dto: CreateTrackDto,
  ): Prisma.TrackUpdateInput {
    const patch: Prisma.TrackUpdateInput = {};
    if (existing.year == null && dto.year != null) patch.year = dto.year;
    if (existing.coverUrl == null && dto.coverUrl != null) patch.coverUrl = dto.coverUrl;
    if (existing.durationSec == null && dto.durationSec != null)
      patch.durationSec = dto.durationSec;
    if (existing.ytMetadata == null && dto.ytMetadata != null) {
      patch.ytMetadata = dto.ytMetadata;
      patch.viewCount = this.viewsFromMeta(dto.ytMetadata);
    }
    const sub = this.joinSubstyles(dto.substyles);
    if (!existing.substyle && sub) patch.substyle = sub;
    if (!existing.artist && dto.artist) patch.artist = dto.artist;
    return patch;
  }

  /**
   * Extrae las reproducciones (viewCount) del JSON de metadata de YouTube como
   * BigInt, para poder ordenar por ese campo. Devuelve null si no hay dato.
   */
  private viewsFromMeta(json: string | null | undefined): bigint | null {
    if (!json) return null;
    try {
      const meta = JSON.parse(json) as { viewCount?: unknown };
      const v = meta?.viewCount;
      if (v == null) return null;
      const s = String(v).trim();
      return /^\d+$/.test(s) ? BigInt(s) : null;
    } catch {
      return null;
    }
  }

  /** Une hasta 3 sub-estilos en un CSV para guardar en la columna `substyle`. */
  private joinSubstyles(arr?: string[]): string | null {
    if (!arr || !arr.length) return null;
    const clean = arr.map((s) => s.trim()).filter(Boolean).slice(0, 4);
    return clean.length ? clean.join(', ') : null;
  }

  /** Crea una canción en el CATÁLOGO global (acción de admin). */
  async create(dto: CreateTrackDto, userId: string): Promise<Track> {
    const { source, sourceId } = this.resolveSource(dto);

    const existing = await this.prisma.track.findFirst({
      where: { source, sourceId, scope: 'CATALOG' },
    });
    if (existing) {
      throw new ConflictException(
        'Esa canción ya existe en el catálogo (mismo link/fuente).',
      );
    }

    const created = await this.prisma.track.create({
      data: {
        title: dto.title,
        artist: dto.artist,
        style: dto.style,
        substyle: this.joinSubstyles(dto.substyles),
        year: dto.year ?? null,
        source,
        sourceId,
        coverUrl: dto.coverUrl ?? null,
        durationSec: dto.durationSec ?? null,
        isRelease: dto.isRelease ?? false,
        approvalStatus: dto.approvalStatus ?? 'APROBADA',
        scope: 'CATALOG',
        ownerId: null,
        artistUserId: dto.artistUserId ?? null,
        ytMetadata: dto.ytMetadata ?? null,
        viewCount: this.viewsFromMeta(dto.ytMetadata),
        // Fecha de lanzamiento: la editada por el usuario (mes/año) tiene
        // prioridad; si no, para YouTube la de subida (si la subida ≈ el año);
        // si no, null y el backfill busca la real (Spotify: desde el embed).
        releaseDate:
          dto.releaseDate ||
          (source === 'YOUTUBE'
            ? this.youtubeReleaseAtCreate(
                this.publishedDateFromMeta(dto.ytMetadata ?? null),
              )
            : null),
        createdById: userId,
      },
    });

    // Si es de YouTube y no llegó con duración, la calcula desde la API ahora.
    if (source === 'YOUTUBE' && created.durationSec == null) {
      await this.fillYoutubeDurations([{ id: created.id, sourceId }]);
      created.durationSec =
        (
          await this.prisma.track.findUnique({
            where: { id: created.id },
            select: { durationSec: true },
          })
        )?.durationSec ?? null;
    }

    return toPublicTrack(created);
  }

  /** Lista el CATÁLOGO global. Si se pasa userId, anota `inLibrary`. */
  async findAll(q: QueryTracksDto, userId?: string): Promise<Paginated<Track>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;

    const where: Prisma.TrackWhereInput = { scope: 'CATALOG' };
    if (q.style) where.style = q.style;
    if (q.substyle)
      where.substyle = { contains: q.substyle, mode: 'insensitive' };
    if (q.source) where.source = q.source;
    // Excluye lo que ya tengo en Mi biblioteca (para el modo "Catálogo").
    if (q.excludeMine && userId) where.savedBy = { none: { userId } };
    if (q.approvalStatus) where.approvalStatus = q.approvalStatus;
    if (q.isRelease !== undefined) where.isRelease = q.isRelease;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { artist: { contains: q.search, mode: 'insensitive' } },
        // Match sin acentos (columna normalizada por trigger).
        { searchText: { contains: normalizeSearch(q.search) } },
      ];
    }

    const orderBy = this.buildOrderBy(q);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.track.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.track.count({ where }),
    ]);

    const data = rows.map(toPublicTrack);
    if (userId && data.length) {
      const saved = await this.prisma.userTrack.findMany({
        where: { userId, trackId: { in: data.map((t) => t.id) } },
        select: { trackId: true },
      });
      const set = new Set(saved.map((s) => s.trackId));
      for (const t of data) t.inLibrary = set.has(t.id);
    }

    return { data, total, page, pageSize };
  }

  /**
   * Feed "Nuevo y sonando": lanzamientos recientes del catálogo (últimos
   * `months` meses), fusionando YouTube + Spotify (mismo tema aparece una vez),
   * ordenados por popularidad/momentum, separados por estilo (bachata/salsa).
   * - YouTube: reproducciones/día (momentum real).
   * - Spotify (sin reproducciones): índice `popularity`.
   * Se normaliza por estilo a 0..1 para poder mezclar ambas señales.
   */
  async discover(months = 5): Promise<DiscoverFeed> {
    const now = new Date();
    /** Corte "YYYY-MM" de hace N meses (0 = sin tope). */
    const monthsAgo = (m: number): string | null => {
      if (m <= 0) return null;
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    // Ventana de estrenos por estilo: bachata tiene mucho más lanzamiento nuevo,
    // así que se acota a 3 meses; salsa es escasa y usa la ventana general.
    const recentMonthsFor = (family: 'BACHATA' | 'SALSA') =>
      family === 'BACHATA' ? Math.min(3, months) : months;

    const rows = await this.prisma.track.findMany({
      where: {
        scope: 'CATALOG',
        approvalStatus: 'APROBADA',
        // Solo YouTube: es la única fuente con reproducciones reales. La
        // popularidad de Spotify (0-100) no es comparable y dejaba arriba temas
        // sin ningún dato de cuánto suenan.
        source: 'YOUTUBE',
        viewCount: { not: null },
        OR: [{ style: { startsWith: 'BACHATA' } }, { style: { startsWith: 'SALSA' } }],
      },
    });

    // Reproducciones por día desde su publicación (momentum), precalculadas.
    const nowMs = now.getTime();
    const vpd = new Map<string, number>();
    for (const r of rows) {
      const d = r.releaseDate ? parseReleaseDate(r.releaseDate) : null;
      const days = d ? Math.max(1, (nowMs - d.getTime()) / 86_400_000) : null;
      vpd.set(r.id, days ? Number(r.viewCount) / days : 0);
    }
    const vpdOf = (r: PrismaTrack) => vpd.get(r.id) ?? 0;
    // Comparación lexicográfica sobre "YYYY-MM[-DD]": lo de solo-año queda fuera
    // (sin mes no se puede ubicar en el tiempo).
    const since = (r: PrismaTrack, cutoff: string | null) =>
      cutoff == null || (r.releaseDate ?? '') >= cutoff;

    // Ids de las que salen marcadas como épicas (para la insignia 🔥 del cliente).
    const epicIds = new Set<string>();

    const build = (family: 'BACHATA' | 'SALSA'): Track[] => {
      const inFamily = rows.filter(
        (r) => (r.style ?? '').startsWith(family) && vpdOf(r) > 0,
      );

      // Épicas: mismas que la insignia 🔥 del catálogo — top 50 por momentum,
      // bachata dentro de 24 meses y salsa sin tope de fecha.
      const epicCutoff = monthsAgo(family === 'SALSA' ? 0 : 24);
      const epics = new Set(
        inFamily
          .filter((r) => since(r, epicCutoff))
          .sort((a, b) => vpdOf(b) - vpdOf(a))
          .slice(0, 50)
          .map((r) => r.id),
      );

      // La lista: los estrenos de la ventana del estilo MÁS las épicas, sin
      // importar su fecha.
      const recentCutoff = monthsAgo(recentMonthsFor(family));
      const picked = inFamily.filter(
        (r) => since(r, recentCutoff) || epics.has(r.id),
      );

      // Deduplica el mismo tema subido más de una vez. No alcanza con
      // título+artista: el listado de artistas difiere entre uploads ("Romeo
      // Santos" vs "Romeo Santos, Prince Royce"). Se agrupa por título y se
      // funden las que comparten al menos un artista — comparar solo el título
      // juntaría temas distintos que se llaman igual. Como se recorre de mayor a
      // menor momentum, la primera de cada grupo es la que queda.
      const groups: { artists: Set<string>; best: PrismaTrack }[] = [];
      const byTitle = new Map<string, typeof groups>();
      for (const r of [...picked].sort((a, b) => vpdOf(b) - vpdOf(a))) {
        const title = normForDup(r.title);
        const artists = new Set(
          splitArtistNames(r.artist).map(normForDup).filter(Boolean),
        );
        const sameTitle = byTitle.get(title) ?? [];
        const hit = sameTitle.find((g) =>
          [...artists].some((a) => [...g.artists].some((b) => sameArtist(a, b))),
        );
        if (hit) {
          // Es la misma canción con otro listado de artistas: se descarta y se
          // enriquece el grupo para poder reconocer futuras variantes.
          for (const a of artists) hit.artists.add(a);
          continue;
        }
        const g = { artists, best: r };
        sameTitle.push(g);
        byTitle.set(title, sameTitle);
        groups.push(g);
      }
      const top = groups.map((g) => g.best).slice(0, 25);
      for (const r of top) if (epics.has(r.id)) epicIds.add(r.id);
      return top.map(toPublicTrack);
    };

    return {
      bachata: build('BACHATA'),
      salsa: build('SALSA'),
      epicIds: [...epicIds],
    };
  }

  /** Cuenta el catálogo por estilo (opcionalmente filtrado por fuente). */
  async summary(source?: 'YOUTUBE' | 'SPOTIFY'): Promise<LibrarySummary> {
    const base: Prisma.TrackWhereInput = { scope: 'CATALOG' };
    if (source) base.source = source;
    const [bachata, salsa] = await this.prisma.$transaction([
      this.prisma.track.count({ where: { ...base, style: 'BACHATA' } }),
      this.prisma.track.count({ where: { ...base, style: 'SALSA' } }),
    ]);
    return { bachata, salsa, total: bachata + salsa };
  }

  /**
   * Directorio de artistas del catálogo (bachata/salsa), agregados por nombre,
   * ordenados alfabéticamente. Cada artista con su nº de canciones y estilos.
   */
  async listArtists(): Promise<ArtistSummary[]> {
    const rows = await this.prisma.track.findMany({
      where: {
        scope: 'CATALOG',
        OR: [{ style: { startsWith: 'BACHATA' } }, { style: { startsWith: 'SALSA' } }],
      },
      select: { artist: true, style: true },
    });
    const map = new Map<
      string,
      { name: string; count: number; bachata: boolean; salsa: boolean }
    >();
    for (const r of rows) {
      const isSalsa = (r.style ?? '').startsWith('SALSA');
      for (const a of splitArtistNames(r.artist)) {
        const k = normForDup(a);
        if (!k) continue;
        const cur = map.get(k) ?? {
          name: a,
          count: 0,
          bachata: false,
          salsa: false,
        };
        cur.count += 1;
        if (isSalsa) cur.salsa = true;
        else cur.bachata = true;
        map.set(k, cur);
      }
    }
    return [...map.values()]
      .map((a) => ({
        name: a.name,
        trackCount: a.count,
        styles: [
          ...(a.bachata ? (['BACHATA'] as DanceStyle[]) : []),
          ...(a.salsa ? (['SALSA'] as DanceStyle[]) : []),
        ],
      }))
      .sort((x, y) =>
        x.name.localeCompare(y.name, 'es', { sensitivity: 'base' }),
      );
  }

  /**
   * "Descubrir novedades fuera del catálogo": toma los artistas que YA tienes en
   * el catálogo (bachata/salsa) como semilla, busca en Spotify sus lanzamientos
   * recientes (álbumes/singles) y devuelve los que AÚN no están en el catálogo,
   * como candidatos para curar. Solo lee metadata pública (no descarga audio).
   * Es pesado (muchas llamadas a Spotify) → cacheado 6 h.
   */
  async discoverCandidates(
    months = 6,
    maxArtists = 30,
  ): Promise<DiscoverCandidate[]> {
    const key = `${months}:${maxArtists}`;
    if (
      this.candidatesCache &&
      this.candidatesCache.key === key &&
      this.candidatesCache.exp > Date.now()
    ) {
      return this.candidatesCache.data;
    }

    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1);
    const sinceStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
    const yearStart = cutoff.getFullYear();
    const yearEnd = now.getFullYear();

    const rows = await this.prisma.track.findMany({
      where: {
        scope: 'CATALOG',
        OR: [{ style: { startsWith: 'BACHATA' } }, { style: { startsWith: 'SALSA' } }],
      },
      select: { title: true, artist: true, style: true },
    });

    // Claves de lo que YA tenemos (para descartar) + conteo de artistas semilla.
    const catalogKeys = new Set<string>();
    const tally = new Map<
      string,
      { name: string; count: number; bachata: number; salsa: number }
    >();
    for (const r of rows) {
      catalogKeys.add(`${normForDup(r.title)}|${normForDup(r.artist)}`);
      const isSalsa = (r.style ?? '').startsWith('SALSA');
      for (const a of splitArtistNames(r.artist)) {
        const k = normForDup(a);
        if (!k) continue;
        const cur = tally.get(k) ?? { name: a, count: 0, bachata: 0, salsa: 0 };
        cur.count += 1;
        if (isSalsa) cur.salsa += 1;
        else cur.bachata += 1;
        tally.set(k, cur);
      }
    }
    const seeds = [...tally.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, maxArtists);

    const out: DiscoverCandidate[] = [];
    const seenTrack = new Set<string>();
    const seenKey = new Set<string>();
    for (const seed of seeds) {
      const releases = await this.spotify.searchNewTracksByArtist(
        seed.name,
        sinceStr,
        yearStart,
        yearEnd,
      );
      const style: DanceStyle = seed.salsa > seed.bachata ? 'SALSA' : 'BACHATA';
      for (const rel of releases) {
        if (seenTrack.has(rel.trackId)) continue;
        const dupKey = `${normForDup(rel.title)}|${normForDup(rel.artist)}`;
        if (catalogKeys.has(dupKey)) continue; // ya está en el catálogo
        if (seenKey.has(dupKey)) continue; // mismo tema traído por otra semilla
        seenTrack.add(rel.trackId);
        seenKey.add(dupKey);
        out.push({
          spotifyTrackId: rel.trackId,
          title: rel.title,
          artist: rel.artist,
          releaseDate: rel.releaseDate,
          coverUrl: rel.coverUrl,
          url: rel.url,
          previewUrl: rel.previewUrl,
          style,
          seedArtist: seed.name,
          albumType: rel.albumType,
        });
      }
      // Pausa entre artistas para no gatillar el anti-abuso de Spotify (responde
      // 400 a ráfagas). Con ~500ms se mantiene estable.
      await new Promise((r) => setTimeout(r, 500));
    }
    out.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    this.candidatesCache = {
      key,
      exp: Date.now() + 6 * 60 * 60 * 1000,
      data: out,
    };
    return out;
  }

  /**
   * "Descubrir novedades por YouTube": toma los CANALES de tus artistas del
   * catálogo (de `ytMetadata.channelId`) como semilla, trae sus subidas
   * recientes y devuelve las que aún NO están en el catálogo, con un estilo
   * PROPUESTO (por el texto o heredado del canal) para que confirmes. Solo lee
   * metadata pública. Pesado (API de YouTube) → cacheado 6 h.
   */
  async discoverYoutube(
    months = 3,
    maxChannels = 40,
  ): Promise<YoutubeDiscoverCandidate[]> {
    const key = `${months}:${maxChannels}`;
    if (
      this.ytCandidatesCache &&
      this.ytCandidatesCache.key === key &&
      this.ytCandidatesCache.exp > Date.now()
    ) {
      return this.ytCandidatesCache.data;
    }

    const now = new Date();
    const cutoff = new Date(
      now.getFullYear(),
      now.getMonth() - months,
      now.getDate(),
    );
    const cutoffISO = cutoff.toISOString();

    const rows = await this.prisma.track.findMany({
      where: {
        scope: 'CATALOG',
        source: 'YOUTUBE',
        OR: [{ style: { startsWith: 'BACHATA' } }, { style: { startsWith: 'SALSA' } }],
      },
      select: { artist: true, style: true, sourceId: true, ytMetadata: true },
    });
    const catalogVideoIds = new Set(rows.map((r) => r.sourceId));

    // Semilla: canales (channelId) de los tracks de YouTube del catálogo.
    const channels = new Map<
      string,
      {
        channelId: string;
        channelTitle: string;
        bachata: number;
        salsa: number;
        artist: string;
      }
    >();
    for (const r of rows) {
      let channelId: string | undefined;
      let channelTitle = '';
      if (r.ytMetadata) {
        try {
          const m = JSON.parse(r.ytMetadata) as {
            channelId?: string;
            channelTitle?: string;
          };
          channelId = m.channelId;
          channelTitle = m.channelTitle ?? '';
        } catch {
          /* metadata inválida: se ignora */
        }
      }
      if (!channelId?.startsWith('UC')) continue;
      const cur = channels.get(channelId) ?? {
        channelId,
        channelTitle,
        bachata: 0,
        salsa: 0,
        artist: r.artist,
      };
      if ((r.style ?? '').startsWith('SALSA')) cur.salsa += 1;
      else cur.bachata += 1;
      if (!cur.channelTitle && channelTitle) cur.channelTitle = channelTitle;
      channels.set(channelId, cur);
    }
    const seeds = [...channels.values()]
      .sort((a, b) => b.bachata + b.salsa - (a.bachata + a.salsa))
      .slice(0, maxChannels);

    const out: YoutubeDiscoverCandidate[] = [];
    const seen = new Set<string>();
    for (const ch of seeds) {
      const uploads = await this.youtube.channelRecentUploads(
        ch.channelId,
        cutoffISO,
        15,
      );
      const baseStyle: DanceStyle = ch.salsa > ch.bachata ? 'SALSA' : 'BACHATA';
      for (const up of uploads) {
        if (catalogVideoIds.has(up.videoId) || seen.has(up.videoId)) continue;
        if (isJunkTitle(up.title)) continue;
        // Los Shorts suelen ser promos/estados, no canciones.
        if (/#shorts?\b/i.test(`${up.title} ${up.description}`)) continue;
        seen.add(up.videoId);
        const cls = classifyStyle(
          up.title,
          up.description,
          baseStyle,
          ch.channelTitle || ch.artist,
        );
        out.push({
          videoId: up.videoId,
          title: up.title,
          channelTitle: up.channelTitle,
          publishedAt: up.publishedAt,
          thumbnailUrl: up.thumbnailUrl,
          url: `https://www.youtube.com/watch?v=${up.videoId}`,
          proposedStyle: cls.style,
          confidence: cls.confidence,
          reason: cls.reason,
          seedArtist: ch.artist,
        });
      }
    }
    // Primero las de confianza alta, luego media, luego baja; dentro de cada
    // nivel, lo más nuevo primero.
    const confRank = { alta: 0, media: 1, baja: 2 } as const;
    out.sort(
      (a, b) =>
        confRank[a.confidence] - confRank[b.confidence] ||
        b.publishedAt.localeCompare(a.publishedAt),
    );
    this.ytCandidatesCache = {
      key,
      exp: Date.now() + 6 * 60 * 60 * 1000,
      data: out,
    };
    return out;
  }

  /**
   * Busca canciones por sus videoIds de YouTube: las del catálogo global y las
   * personales del propio usuario. Devuelve un mapa videoId → Track (con
   * `inLibrary` resuelto). Para enriquecer vistas externas (ej: playlists de
   * YouTube) con nuestra data. La personal del usuario tiene prioridad.
   */
  async findByYoutubeIds(
    videoIds: string[],
    userId?: string,
  ): Promise<Map<string, Track>> {
    const ids = [...new Set(videoIds.filter(Boolean))];
    if (!ids.length) return new Map();

    const scopeFilter: Prisma.TrackWhereInput[] = [{ scope: 'CATALOG' }];
    if (userId) scopeFilter.push({ scope: 'PERSONAL', ownerId: userId });

    const rows = await this.prisma.track.findMany({
      where: { source: 'YOUTUBE', sourceId: { in: ids }, OR: scopeFilter },
    });
    const tracks = rows.map(toPublicTrack);

    // inLibrary: las personales propias siempre cuentan; las del catálogo, si
    // están en UserTrack del usuario.
    if (userId && tracks.length) {
      const saved = await this.prisma.userTrack.findMany({
        where: { userId, trackId: { in: tracks.map((t) => t.id) } },
        select: { trackId: true },
      });
      const set = new Set(saved.map((s) => s.trackId));
      for (const t of tracks) {
        t.inLibrary = t.scope === 'PERSONAL' ? t.ownerId === userId : set.has(t.id);
      }
    }

    // Si hay catálogo y personal con el mismo videoId, prioriza la personal.
    const map = new Map<string, Track>();
    for (const t of tracks) {
      const prev = map.get(t.sourceId);
      if (!prev || t.scope === 'PERSONAL') map.set(t.sourceId, t);
    }
    return map;
  }

  /** Igual que findByYoutubeIds pero para tracks de Spotify (por sourceId). */
  async findBySpotifyIds(
    spotifyIds: string[],
    userId?: string,
  ): Promise<Map<string, Track>> {
    const ids = [...new Set(spotifyIds.filter(Boolean))];
    if (!ids.length) return new Map();

    const scopeFilter: Prisma.TrackWhereInput[] = [{ scope: 'CATALOG' }];
    if (userId) scopeFilter.push({ scope: 'PERSONAL', ownerId: userId });

    const rows = await this.prisma.track.findMany({
      where: { source: 'SPOTIFY', sourceId: { in: ids }, OR: scopeFilter },
    });
    const tracks = rows.map(toPublicTrack);

    if (userId && tracks.length) {
      const saved = await this.prisma.userTrack.findMany({
        where: { userId, trackId: { in: tracks.map((t) => t.id) } },
        select: { trackId: true },
      });
      const set = new Set(saved.map((s) => s.trackId));
      for (const t of tracks) {
        t.inLibrary =
          t.scope === 'PERSONAL' ? t.ownerId === userId : set.has(t.id);
      }
    }

    const map = new Map<string, Track>();
    for (const t of tracks) {
      const prev = map.get(t.sourceId);
      if (!prev || t.scope === 'PERSONAL') map.set(t.sourceId, t);
    }
    return map;
  }

  /**
   * Crea una canción del catálogo si no existe. Si ya existe (por fuente),
   * NO pisa lo que ya tiene valor: solo rellena los campos vacíos. Así una
   * re-importación nunca borra ni sobreescribe la curación manual (estilo,
   * sub-estilos…). Devuelve id + si fue creada.
   */
  async upsertCatalog(
    dto: CreateTrackDto,
    userId: string,
    opts?: { fillEmptyOnly?: boolean },
  ): Promise<{ id: string; created: boolean }> {
    const { source, sourceId } = this.resolveSource(dto);
    const existing = await this.prisma.track.findFirst({
      where: { source, sourceId, scope: 'CATALOG' },
    });

    if (existing) {
      const patch: Prisma.TrackUpdateInput = opts?.fillEmptyOnly
        ? this.fillEmptyPatch(existing, dto)
        : {
            // Sobreescritura completa (importación deliberada, ej. Excel).
            title: dto.title,
            artist: dto.artist,
            style: dto.style,
            substyle: this.joinSubstyles(dto.substyles),
            year: dto.year ?? null,
            coverUrl: dto.coverUrl ?? null,
            durationSec: dto.durationSec ?? null,
            ytMetadata: dto.ytMetadata ?? null,
            viewCount: this.viewsFromMeta(dto.ytMetadata),
          };

      if (Object.keys(patch).length) {
        await this.prisma.track.update({ where: { id: existing.id }, data: patch });
      }
      return { id: existing.id, created: false };
    }

    const created = await this.prisma.track.create({
      data: {
        title: dto.title,
        artist: dto.artist,
        style: dto.style,
        substyle: this.joinSubstyles(dto.substyles),
        year: dto.year ?? null,
        coverUrl: dto.coverUrl ?? null,
        durationSec: dto.durationSec ?? null,
        ytMetadata: dto.ytMetadata ?? null,
        viewCount: this.viewsFromMeta(dto.ytMetadata),
        source,
        sourceId,
        scope: 'CATALOG',
        createdById: userId,
      },
    });
    return { id: created.id, created: true };
  }

  /** Catálogo es visible para todos; una canción PERSONAL solo para su dueño. */
  async findOne(id: string, userId?: string): Promise<Track> {
    const t = await this.prisma.track.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Canción no encontrada');
    if (t.scope === 'PERSONAL' && t.ownerId !== userId) {
      throw new NotFoundException('Canción no encontrada');
    }
    return toPublicTrack(t);
  }

  async update(id: string, dto: UpdateTrackDto): Promise<Track> {
    await this.ensureExists(id);

    const data: Prisma.TrackUpdateInput = {
      title: dto.title,
      artist: dto.artist,
      style: dto.style,
      substyle:
        dto.substyles !== undefined ? this.joinSubstyles(dto.substyles) : undefined,
      year: dto.year,
      coverUrl: dto.coverUrl,
      durationSec: dto.durationSec,
      isRelease: dto.isRelease,
      approvalStatus: dto.approvalStatus,
      ytMetadata: dto.ytMetadata,
      viewCount:
        dto.ytMetadata !== undefined
          ? this.viewsFromMeta(dto.ytMetadata)
          : undefined,
    };

    // Si se cambia el link, re-resolvemos la fuente y evitamos duplicados.
    if (dto.link) {
      const parsed = parseTrackLink(dto.link);
      if (!parsed) {
        throw new BadRequestException(
          'No se pudo reconocer el link (esperado Spotify o YouTube).',
        );
      }
      const dup = await this.prisma.track.findFirst({
        where: {
          source: parsed.source,
          sourceId: parsed.sourceId,
          scope: 'CATALOG',
          NOT: { id },
        },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          'Ya existe otra canción en el catálogo con ese link.',
        );
      }
      data.source = parsed.source;
      data.sourceId = parsed.sourceId;
    }

    const updated = await this.prisma.track.update({ where: { id }, data });
    return toPublicTrack(updated);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.ensureExists(id);
    await this.prisma.track.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Marca una canción como no-embebible (embeddable=false en su ytMetadata).
   * Se usa cuando el reproductor detecta que YouTube bloquea el embed.
   */
  async markNotEmbeddable(id: string): Promise<{ ok: true }> {
    const track = await this.prisma.track.findUnique({
      where: { id },
      select: { ytMetadata: true },
    });
    if (!track) throw new NotFoundException('Canción no encontrada');

    let meta: Record<string, unknown> = {};
    if (track.ytMetadata) {
      try {
        meta = JSON.parse(track.ytMetadata) as Record<string, unknown>;
      } catch {
        meta = {};
      }
    }
    meta.embeddable = false;
    await this.prisma.track.update({
      where: { id },
      data: { ytMetadata: JSON.stringify(meta) },
    });
    return { ok: true };
  }

  /** Carga masiva (upsert por source+sourceId). */
  async importMany(rows: CreateTrackDto[], userId: string): Promise<ImportResult> {
    const result: ImportResult = { created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const dto = rows[i];
      try {
        const { source, sourceId } = this.resolveSource(dto);
        const existing = await this.prisma.track.findFirst({
          where: { source, sourceId, scope: 'CATALOG' },
        });

        const data = {
          title: dto.title,
          artist: dto.artist,
          style: dto.style,
          substyle: this.joinSubstyles(dto.substyles),
          year: dto.year ?? null,
          coverUrl: dto.coverUrl ?? null,
          durationSec: dto.durationSec ?? null,
          isRelease: dto.isRelease ?? false,
          approvalStatus: dto.approvalStatus ?? 'APROBADA',
          artistUserId: dto.artistUserId ?? null,
        };

        if (existing) {
          await this.prisma.track.update({ where: { id: existing.id }, data });
          result.updated++;
        } else {
          await this.prisma.track.create({
            data: { ...data, source, sourceId, createdById: userId },
          });
          result.created++;
        }
      } catch (e) {
        result.errors.push({
          index: i,
          reason: e instanceof Error ? e.message : 'error desconocido',
        });
      }
    }
    return result;
  }

  /** Guarda en el catálogo las canciones extraídas de una playlist de YouTube. */
  /** sourceIds de YouTube ya presentes en el catálogo. */
  async catalogYoutubeSourceIds(): Promise<string[]> {
    const rows = await this.prisma.track.findMany({
      where: { source: 'YOUTUBE', scope: 'CATALOG' },
      select: { sourceId: true },
    });
    return rows.map((r) => r.sourceId);
  }

  /**
   * Rellena el estilo (detectedStyle) de canciones que no lo tienen, cruzándolas
   * con el CATÁLOGO por artista+título normalizado (tu curación es la fuente más
   * fiable, mejor que los géneros de Spotify que suelen venir vacíos). Muta los
   * items y devuelve cuántos rellenó.
   */
  async fillStylesFromCatalog(
    items: {
      title: string;
      artist?: string | null;
      detectedStyle?: DanceStyle | null;
    }[],
  ): Promise<number> {
    if (!items.some((i) => !i.detectedStyle)) return 0;
    const firstArtist = (a: string | null | undefined) =>
      (a ?? '').split(/[,&]|\bfeat\b|\bft\b/i)[0];
    const rows = await this.prisma.track.findMany({
      where: { scope: 'CATALOG' },
      select: { title: true, artist: true, style: true },
    });
    const byArtistTitle = new Map<string, DanceStyle>();
    const byTitle = new Map<string, Set<DanceStyle>>();
    for (const r of rows) {
      const t = normForDup(r.title);
      if (!t) continue;
      const ak = `${normForDup(firstArtist(r.artist))}|${t}`;
      if (!byArtistTitle.has(ak)) byArtistTitle.set(ak, r.style as DanceStyle);
      const set = byTitle.get(t) ?? new Set<DanceStyle>();
      set.add(r.style as DanceStyle);
      byTitle.set(t, set);
    }
    let filled = 0;
    for (const it of items) {
      if (it.detectedStyle) continue;
      const t = normForDup(it.title);
      if (!t) continue;
      const ak = `${normForDup(firstArtist(it.artist))}|${t}`;
      let s = byArtistTitle.get(ak);
      // Fallback por título solo si en el catálogo ese título es de un único estilo.
      if (!s) {
        const set = byTitle.get(t);
        if (set && set.size === 1) s = [...set][0];
      }
      if (s) {
        it.detectedStyle = s;
        filled++;
      }
    }
    return filled;
  }

  /** sourceIds de Spotify ya en el catálogo (para ignorar al importar). */
  async catalogSpotifySourceIds(): Promise<string[]> {
    const rows = await this.prisma.track.findMany({
      where: { source: 'SPOTIFY', scope: 'CATALOG' },
      select: { sourceId: true },
    });
    return rows.map((r) => r.sourceId);
  }

  /**
   * Importa al catálogo (como tracks SPOTIFY) las canciones ya resueltas de una
   * playlist de Spotify. El estilo sale de lo detectado o del override elegido;
   * las que queden sin estilo se omiten. No pisa la curación de las existentes.
   */
  async importSpotifyToCatalog(
    items: {
      sourceId: string;
      title: string;
      artist?: string | null;
      durationSec?: number | null;
      year?: number | null;
      coverUrl?: string | null;
      detectedStyle?: DanceStyle | null;
      playable?: boolean | null;
      releaseDate?: string | null;
    }[],
    overrides: Record<string, DanceStyle> | undefined,
    userId: string,
  ): Promise<PlaylistImportResult> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const it of items) {
      try {
        const override = overrides?.[it.sourceId];
        const style: DanceStyle | undefined =
          override && DANCE_STYLES.includes(override)
            ? override
            : (it.detectedStyle ?? undefined);
        if (!style) {
          errors.push(`${it.title}: sin estilo, no importada`);
          continue;
        }
        const res = await this.upsertCatalog(
          {
            title: it.title,
            artist: it.artist ?? 'Desconocido',
            style,
            source: 'SPOTIFY',
            sourceId: it.sourceId,
            year: it.year ?? undefined,
            coverUrl: it.coverUrl ?? undefined,
            durationSec: it.durationSec ?? undefined,
          },
          userId,
          { fillEmptyOnly: true },
        );
        // Reproducibilidad + fecha completa (del embed): datos aparte del upsert.
        const extra: Prisma.TrackUpdateInput = {};
        if (typeof it.playable === 'boolean') extra.spotifyPlayable = it.playable;
        if (it.releaseDate) extra.releaseDate = it.releaseDate;
        if (Object.keys(extra).length) {
          await this.prisma.track.update({
            where: { id: res.id },
            data: extra,
          });
        }
        if (res.created) created++;
        else updated++;
      } catch (e) {
        errors.push(`${it.title}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }
    return { total: items.length, created, updated, errors };
  }

  /** Canciones de catálogo (YouTube) que no tienen duración guardada. */
  async catalogMissingDuration(): Promise<{ id: string; sourceId: string }[]> {
    return this.prisma.track.findMany({
      where: { scope: 'CATALOG', source: 'YOUTUBE', durationSec: null },
      select: { id: true, sourceId: true },
    });
  }

  /**
   * Rellena `viewCount` (desde ytMetadata) en las canciones del catálogo que aún
   * no lo tienen. Idempotente; sirve para ponerse al día con datos ya guardados.
   */
  async backfillViewCounts(): Promise<{ updated: number }> {
    const rows = await this.prisma.track.findMany({
      where: { scope: 'CATALOG', viewCount: null, ytMetadata: { not: null } },
      select: { id: true, ytMetadata: true },
    });
    let updated = 0;
    for (const r of rows) {
      const v = this.viewsFromMeta(r.ytMetadata);
      if (v != null) {
        await this.prisma.track.update({
          where: { id: r.id },
          data: { viewCount: v },
        });
        updated++;
      }
    }
    return { updated };
  }

  /**
   * Rellena `spotifyPlayable` (¿reproducible en el embed?) de las canciones de
   * Spotify que aún no lo tienen, leyendo el embed de cada track. Idempotente y
   * auto-terminante; procesa hasta `limit` por llamada (fetch por track).
   */
  async backfillSpotifyPlayable(
    limit = 40,
  ): Promise<{ updated: number; remaining: number }> {
    const rows = await this.prisma.track.findMany({
      where: { source: 'SPOTIFY', spotifyPlayable: null },
      select: { id: true, sourceId: true },
      take: limit,
    });
    let updated = 0;
    for (const r of rows) {
      const playable = await this.spotify.getPlayableById(r.sourceId);
      if (playable !== null) {
        await this.prisma.track.update({
          where: { id: r.id },
          data: { spotifyPlayable: playable },
        });
        updated++;
      }
    }
    const remaining = await this.prisma.track.count({
      where: { source: 'SPOTIFY', spotifyPlayable: null },
    });
    return { updated, remaining };
  }

  /**
   * Aplica fechas de lanzamiento por id: { id: "YYYY-MM-01" | "YYYY" | null }.
   * `null` (o "") resetea (para que el backfill la recalcule). Formatos inválidos
   * se ignoran. Devuelve cuántas se actualizaron.
   */
  async applyReleaseDates(
    dates: Record<string, string | null>,
  ): Promise<{ updated: number }> {
    let updated = 0;
    for (const [id, rd] of Object.entries(dates ?? {})) {
      if (typeof id !== 'string' || !id) continue;
      let value: string | null | undefined;
      if (rd == null || rd === '') value = null; // reset
      else if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(rd)) value = rd;
      else value = undefined; // formato inválido: ignora
      if (value === undefined) continue;
      await this.prisma.track.update({
        where: { id },
        data: { releaseDate: value },
      });
      updated++;
    }
    return { updated };
  }

  /** Aplica duraciones (en segundos) por id de track. */
  async setDurations(
    updates: { id: string; durationSec: number }[],
  ): Promise<number> {
    let n = 0;
    for (const u of updates) {
      await this.prisma.track.update({
        where: { id: u.id },
        data: { durationSec: u.durationSec },
      });
      n++;
    }
    return n;
  }

  /**
   * Agrupa canciones del catálogo que parecen la misma (mismo título+artista
   * normalizado, ignorando adornos como "official video", "en vivo", "demo",
   * etc.). Devuelve solo los grupos con 2+ candidatas, para que el admin elija
   * cuál conservar.
   */
  async findDuplicateGroups(): Promise<DuplicateGroup[]> {
    const rows = await this.prisma.track.findMany({
      where: { scope: 'CATALOG' },
      orderBy: { createdAt: 'asc' },
    });
    const groups = new Map<string, typeof rows>();
    for (const t of rows) {
      const titleKey = normForDup(t.title);
      if (!titleKey) continue; // título sin contenido tras limpiar
      const key = `${normForDup(t.artist)}|${titleKey}`;
      const arr = groups.get(key);
      if (arr) arr.push(t);
      else groups.set(key, [t]);
    }
    return [...groups.entries()]
      .filter(([, g]) => g.length > 1)
      .map(([key, g]) => ({ key, tracks: g.map(toPublicTrack) }));
  }

  /**
   * Conserva `keepId` y elimina `removeIds`, **reasignando** sus referencias
   * (bibliotecas y playlists) a la que se queda, para no perder la canción de
   * ningún lado. El resto (tags, solicitudes) se borra en cascada.
   */
  async mergeDuplicates(
    keepId: string,
    removeIds: string[],
  ): Promise<{ kept: string; removed: number }> {
    await this.ensureExists(keepId);
    const ids = removeIds.filter((r) => r && r !== keepId);
    for (const rid of ids) {
      await this.prisma.$transaction(async (tx) => {
        // Playlists: mover a keep, evitando duplicar en la misma playlist.
        const items = await tx.playlistItem.findMany({
          where: { trackId: rid },
          select: { id: true, playlistId: true },
        });
        for (const it of items) {
          const exists = await tx.playlistItem.findFirst({
            where: { playlistId: it.playlistId, trackId: keepId },
            select: { id: true },
          });
          if (exists) await tx.playlistItem.delete({ where: { id: it.id } });
          else
            await tx.playlistItem.update({
              where: { id: it.id },
              data: { trackId: keepId },
            });
        }
        // Bibliotecas (Mis Canciones): igual.
        const uts = await tx.userTrack.findMany({
          where: { trackId: rid },
          select: { userId: true },
        });
        for (const ut of uts) {
          const exists = await tx.userTrack.findUnique({
            where: { userId_trackId: { userId: ut.userId, trackId: keepId } },
            select: { userId: true },
          });
          if (exists)
            await tx.userTrack.deleteMany({
              where: { userId: ut.userId, trackId: rid },
            });
          else
            await tx.userTrack.updateMany({
              where: { userId: ut.userId, trackId: rid },
              data: { trackId: keepId },
            });
        }
        await tx.track.delete({ where: { id: rid } });
      });
    }
    return { kept: keepId, removed: ids.length };
  }

  async importPlaylistItems(
    items: ExtractedTrackMetadata[],
    defaultStyle: DanceStyle | undefined,
    userId: string,
    overrides?: Record<string, DanceStyle>,
    dateOverrides?: Record<string, string>,
  ): Promise<PlaylistImportResult> {
    let created = 0;
    let updated = 0; // ya estaban en el catálogo (se omiten)
    const errors: string[] = [];

    for (const it of items) {
      try {
        // ¿ya está en el catálogo? -> se omite (no se toca).
        const existing = await this.prisma.track.findFirst({
          where: { source: 'YOUTUBE', sourceId: it.sourceId, scope: 'CATALOG' },
          select: { id: true },
        });
        if (existing) {
          updated++;
          continue;
        }

        const override = overrides?.[it.sourceId];
        const style: DanceStyle | undefined =
          override && DANCE_STYLES.includes(override)
            ? override
            : (it.detectedStyle ?? defaultStyle ?? undefined);
        // Sin estilo (no detectado y el usuario no eligió): se omite.
        if (!style) {
          errors.push(`${it.title}: sin estilo, no importada`);
          continue;
        }
        const res = await this.upsertCatalog(
          {
            title: it.title,
            artist: it.artist ?? it.channelTitle ?? 'Desconocido',
            style,
            source: 'YOUTUBE',
            sourceId: it.sourceId,
            year: it.year ?? undefined,
            coverUrl: it.coverUrl ?? undefined,
            durationSec: it.durationSec ?? undefined,
            ytMetadata: JSON.stringify(it.details),
          },
          userId,
          { fillEmptyOnly: true },
        );
        if (res.created) {
          created++;
          // Fecha: la editada por el usuario (mes+año) tiene prioridad; si no,
          // la de subida cuando coincide con el año; si no, la busca el backfill.
          const override = dateOverrides?.[it.sourceId];
          const rel =
            override && /^\d{4}-\d{2}-\d{2}$/.test(override)
              ? override
              : this.youtubeReleaseAtCreate(it.details?.publishedAt ?? null);
          if (rel) {
            await this.prisma.track.update({
              where: { id: res.id },
              data: { releaseDate: rel },
            });
          }
        } else updated++;
      } catch (e) {
        errors.push(
          `${it.title}: ${e instanceof Error ? e.message : 'error'}`,
        );
      }
    }

    // Rellena la duración de las importadas que hayan quedado sin ella.
    const ids = items.map((i) => i.sourceId).filter(Boolean);
    if (ids.length) {
      const missing = await this.prisma.track.findMany({
        where: {
          source: 'YOUTUBE',
          scope: 'CATALOG',
          durationSec: null,
          sourceId: { in: ids },
        },
        select: { id: true, sourceId: true },
      });
      await this.fillYoutubeDurations(missing);
    }

    return { total: items.length, created, updated, errors };
  }

  private buildOrderBy(q: QueryTracksDto): Prisma.TrackOrderByWithRelationInput {
    // Ordenamiento por columna (click en el header).
    if (q.sortBy) {
      const dir: Prisma.SortOrder = q.sortDir === 'desc' ? 'desc' : 'asc';
      switch (q.sortBy) {
        case 'title':
          return { title: dir };
        case 'artist':
          return { artist: dir };
        case 'year':
          return { year: dir };
        case 'releaseDate':
          // Fecha de lanzamiento completa (mes+año). Sin fecha ('' o null) al final.
          return { releaseDate: { sort: dir, nulls: 'last' } };
        case 'createdAt':
          return { createdAt: dir };
        case 'views':
          // Las que no tienen dato de reproducciones van siempre al final.
          return { viewCount: { sort: dir, nulls: 'last' } };
      }
    }
    switch (q.sort) {
      case 'title':
        return { title: 'asc' };
      case 'artist':
        return { artist: 'asc' };
      case 'popularity':
        return { songRequests: { _count: 'desc' } };
      case 'recent':
      default:
        return { createdAt: 'desc' };
    }
  }

  resolveSource(dto: CreateTrackDto): {
    source: TrackSource;
    sourceId: string;
  } {
    if (dto.link) {
      const parsed = parseTrackLink(dto.link);
      if (!parsed) {
        throw new BadRequestException(
          'No se pudo reconocer el link (esperado Spotify o YouTube).',
        );
      }
      return parsed;
    }
    if (dto.source && dto.sourceId) {
      return { source: dto.source, sourceId: dto.sourceId };
    }
    throw new BadRequestException(
      'Entrega un `link`, o bien `source` + `sourceId`.',
    );
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.track.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Canción no encontrada');
  }
}
