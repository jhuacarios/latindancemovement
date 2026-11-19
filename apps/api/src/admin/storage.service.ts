import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type {
  StorageBucketDto,
  StorageGroupDto,
  StorageLimits,
  StorageReportDto,
  StorageTableDto,
} from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';

const LIMITS_KEY = 'storage.limits';
/** Por defecto: volumen de Postgres del plan Hobby de Railway y capa gratis de R2. Editables. */
const DEFAULT_LIMITS: StorageLimits = { dbGb: 5, r2Gb: 10 };
/** Precios de R2 (US$ por GB-mes). La capa gratis solo aplica a Standard. */
const R2_STANDARD_USD = 0.015;
const R2_IA_USD = 0.01;
/** Tope de objetos a listar por bucket (para que la página no tarde de más). */
const MAX_OBJECTS = 200_000;
/** El informe se cachea un rato: listar buckets grandes cuesta. */
const CACHE_MS = 5 * 60_000;
const GB = 1024 ** 3;

/** Qué guarda cada tabla (las que no estén acá se muestran con su nombre). */
const TABLE_LABELS: Record<string, string> = {
  ChatMessage: 'Mensajes del chat (con fotos)',
  CommunityPlace: 'Sociales, salsotecas y DJs (con foto principal)',
  CommunityPlacePhoto: 'Galerías de los sociales',
  Event: 'Eventos (con flyer)',
  Academy: 'Academias (con logo)',
  SiteSetting: 'Configuración del sitio (logo)',
  Track: 'Catálogo de canciones',
  RecordingAnalysis: 'Análisis del Estudio',
  AudioFile: 'Archivos del Estudio (registros)',
  AcademyVideo: 'Videos de academias (registros)',
  User: 'Usuarios',
  Playlist: 'Playlists',
  PlaylistItem: 'Canciones en playlists',
  UserTrack: 'Mis Canciones',
};

interface BucketSpec {
  key: StorageBucketDto['key'];
  label: string;
  envBucket: string;
  /** Agrupa cada objeto por su clave. */
  group: (key: string) => string;
}

const BUCKETS: BucketSpec[] = [
  {
    key: 'studio',
    label: 'Estudio (audio de los usuarios)',
    envBucket: 'S3_BUCKET',
    group: (k) => (k.startsWith('audio/') ? 'Audio subido' : 'Otros'),
  },
  {
    key: 'media',
    label: 'Media de academias',
    envBucket: 'S3_MEDIA_BUCKET',
    group: (k) => {
      const m = /^academies\/[^/]+\/([^/]+)\//.exec(k);
      switch (m?.[1]) {
        case 'videos':
          return 'Videos (galería)';
        case 'photos':
          return 'Fotos (galería)';
        case 'thumbs':
          return 'Miniaturas';
        case 'vault':
          return 'Bóveda';
        case 'compat':
          return 'Copias MP4 compatibles';
        default:
          return 'Otros';
      }
    },
  },
];

/**
 * Resumen de almacenamiento para el SUPER_ADMIN: tamaño de Postgres (y sus
 * tablas más pesadas) y de los buckets S3/R2 (listando los objetos reales).
 * No lee tablas de otros módulos: usa el catálogo de Postgres y la API S3.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private cache: { at: number; report: StorageReportDto } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async limits(): Promise<StorageLimits> {
    const row = await this.prisma.setting.findUnique({ where: { key: LIMITS_KEY } });
    if (!row) return DEFAULT_LIMITS;
    try {
      return { ...DEFAULT_LIMITS, ...(JSON.parse(row.value) as Partial<StorageLimits>) };
    } catch {
      return DEFAULT_LIMITS;
    }
  }

  async setLimits(input: Partial<StorageLimits>): Promise<StorageLimits> {
    const next = { ...(await this.limits()), ...input };
    if (!(next.dbGb > 0) || !(next.r2Gb > 0)) {
      throw new BadRequestException('Los límites deben ser mayores que 0.');
    }
    await this.prisma.setting.upsert({
      where: { key: LIMITS_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: LIMITS_KEY, value: JSON.stringify(next) },
    });
    if (this.cache) this.cache.report.limits = next;
    return next;
  }

  async report(refresh = false): Promise<StorageReportDto> {
    if (!refresh && this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return { ...this.cache.report, limits: await this.limits() };
    }
    const [limits, database, buckets] = await Promise.all([
      this.limits(),
      this.database(),
      Promise.all(BUCKETS.map((b) => this.bucket(b))),
    ]);
    const standard = buckets.reduce((a, b) => a + b.standardBytes, 0);
    const ia = buckets.reduce((a, b) => a + b.infrequentBytes, 0);
    const r2EstimatedUsd =
      Math.max(0, standard / GB - DEFAULT_LIMITS.r2Gb) * R2_STANDARD_USD + (ia / GB) * R2_IA_USD;
    const report: StorageReportDto = {
      generatedAt: new Date().toISOString(),
      limits,
      database,
      buckets,
      r2EstimatedUsd: Math.round(r2EstimatedUsd * 100) / 100,
    };
    this.cache = { at: Date.now(), report };
    return report;
  }

  private async database(): Promise<StorageReportDto['database']> {
    const [{ size }] = await this.prisma.$queryRaw<{ size: bigint }[]>`
      SELECT pg_database_size(current_database()) AS size`;
    const rows = await this.prisma.$queryRaw<{ table: string; bytes: bigint; rows: bigint }[]>`
      SELECT c.relname AS "table",
             pg_total_relation_size(c.oid) AS bytes,
             GREATEST(COALESCE(s.n_live_tup, 0), c.reltuples, 0)::bigint AS rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC
       LIMIT 12`;
    // La estimación de Postgres puede ir atrasada; en tablas chicas, conteo exacto.
    const tables: StorageTableDto[] = await Promise.all(
      rows.map(async (r) => {
        let count = Number(r.rows);
        if (count < 10_000) {
          const ident = `"${r.table.replace(/"/g, '""')}"`;
          const [{ n }] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM ${ident}`,
          );
          count = Number(n);
        }
        return {
          table: r.table,
          label: TABLE_LABELS[r.table] ?? r.table,
          bytes: Number(r.bytes),
          rows: count,
        };
      }),
    );
    return { totalBytes: Number(size), tables };
  }

  private async bucket(spec: BucketSpec): Promise<StorageBucketDto> {
    const env = process.env;
    const bucket = env[spec.envBucket];
    const base: StorageBucketDto = {
      key: spec.key,
      label: spec.label,
      bucket: bucket ?? null,
      configured: false,
      totalBytes: 0,
      objectCount: 0,
      standardBytes: 0,
      infrequentBytes: 0,
      groups: [],
      truncated: false,
      error: null,
    };
    if (!bucket || !env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      return base;
    }
    base.configured = true;
    const client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION || 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
    const groups = new Map<string, StorageGroupDto>();
    try {
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }),
        );
        for (const o of page.Contents ?? []) {
          const size = o.Size ?? 0;
          base.totalBytes += size;
          base.objectCount += 1;
          if (o.StorageClass === 'STANDARD_IA') base.infrequentBytes += size;
          else base.standardBytes += size;
          const label = spec.group(o.Key ?? '');
          const g = groups.get(label) ?? { label, bytes: 0, count: 0 };
          g.bytes += size;
          g.count += 1;
          groups.set(label, g);
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (base.objectCount >= MAX_OBJECTS && token) {
          base.truncated = true;
          token = undefined;
        }
      } while (token);
    } catch (e) {
      this.logger.warn(`No se pudo listar ${bucket}: ${(e as Error).message}`);
      base.error = 'No se pudo leer el bucket (revisa credenciales/CORS/permisos de listado).';
    } finally {
      client.destroy();
    }
    base.groups = [...groups.values()].sort((a, b) => b.bytes - a.bytes);
    return base;
  }
}
