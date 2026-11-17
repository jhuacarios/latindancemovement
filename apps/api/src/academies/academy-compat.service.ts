import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ACADEMY_COMPAT_MAX_MINUTES } from '@baile-latino/types';
import { PrismaService } from '../prisma/prisma.service';
import { postJson } from '../common/post-json';
import { redisConnection } from '../common/redis';
import { MEDIA_CONFIG, type MediaConfig } from './media.config';
import { MediaStorageService } from './media-storage.service';

const QUEUE_NAME = 'academy-compat';
const ATTEMPTS = 2;
/** Esperar turno detrás de Demucs + convertir hasta 15 min de video 1080p: margen amplio. */
const COMPAT_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const COMPAT_MIME = 'video/mp4';

/** El analizador respondió 422: el archivo no sirve, no tiene sentido reintentar. */
export class CompatFileError extends Error {}

export interface CompatResult {
  result: 'converted' | 'not_needed' | 'too_long';
  durationMs: number;
  sizeBytes?: number | null;
}

/** Cliente del endpoint /compat del analizador Python. */
@Injectable()
export class AcademyCompatClient {
  constructor(@Inject(MEDIA_CONFIG) private readonly config: MediaConfig | null) {}

  async compat(videoUrl: string, uploadUrl: string, maxDurationSec: number): Promise<CompatResult> {
    const c = this.config?.compat;
    if (!c) throw new Error('La conversión de videos no está configurada.');
    const res = await postJson(
      `${c.analyzerUrl}/compat`,
      { videoUrl, uploadUrl, maxDurationSec },
      { Authorization: `Bearer ${c.analyzerToken}` },
      COMPAT_TIMEOUT_MS,
    );
    if (res.status === 422) {
      const detail = (res.body as { detail?: unknown } | null)?.detail;
      throw new CompatFileError(typeof detail === 'string' ? detail : 'Video inválido.');
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`El analizador respondió HTTP ${res.status}.`);
    const body = res.body as CompatResult | null;
    if (!body || !['converted', 'not_needed', 'too_long'].includes(body.result)) {
      throw new Error('Respuesta inválida del analizador.');
    }
    return body;
  }
}

/**
 * Versión compatible de los videos de la galería (MP4 H.264, color normal, máx.
 * 1080p): la genera el analizador, de a uno, solo cuando hace falta (HEVC/HDR del
 * iPhone) y para videos de hasta 15 min. La copia NO cuenta en el cupo de la
 * academia; se borra cuando el video va a la bóveda o se elimina.
 */
@Injectable()
export class AcademyCompatService {
  private readonly logger = new Logger(AcademyCompatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaStorageService,
    private readonly client: AcademyCompatClient,
  ) {}

  compatKey(academyId: string, videoId: string): string {
    return `academies/${academyId}/compat/${videoId}.mp4`;
  }

  /** Procesa un video (lo llama la cola). */
  async process(videoId: string): Promise<void> {
    const v = await this.prisma.academyVideo.findUnique({
      where: { id: videoId },
      select: { id: true, academyId: true, storageKey: true, mimeType: true, status: true, location: true },
    });
    // Borrado, movido a la bóveda o foto mientras esperaba: nada que hacer.
    if (!v || v.status !== 'READY' || v.location !== 'GALLERY' || !v.mimeType.startsWith('video/')) return;
    await this.prisma.academyVideo.update({
      where: { id: v.id },
      data: { compatStatus: 'PROCESSING', compatError: null },
    });

    const key = this.compatKey(v.academyId, v.id);
    const r = await this.client.compat(
      await this.media.analyzerViewUrl(v.storageKey),
      await this.media.analyzerUploadUrl(key, COMPAT_MIME),
      ACADEMY_COMPAT_MAX_MINUTES * 60,
    );

    // Si mientras convertía lo movieron a la bóveda o lo borraron, la copia sobra.
    const still = await this.prisma.academyVideo.findUnique({ where: { id: v.id }, select: { location: true } });
    if (!still || still.location !== 'GALLERY') {
      if (r.result === 'converted') await this.media.remove(key);
      if (still) await this.prisma.academyVideo.update({ where: { id: v.id }, data: { compatStatus: null } });
      return;
    }

    await this.prisma.academyVideo.update({
      where: { id: v.id },
      data:
        r.result === 'converted'
          ? { compatStatus: 'DONE', compatKey: key, compatSizeBytes: BigInt(r.sizeBytes ?? 0) }
          : { compatStatus: r.result === 'not_needed' ? 'NOT_NEEDED' : 'TOO_LONG', compatKey: null, compatSizeBytes: null },
    });
    this.logger.log(`Video ${v.id}: ${r.result}`);
  }

  async markFailed(videoId: string, message: string): Promise<void> {
    await this.prisma.academyVideo
      .update({ where: { id: videoId }, data: { compatStatus: 'ERROR', compatError: message.slice(0, 500) } })
      .catch(() => undefined);
  }

  /** Borra la copia (al mover a la bóveda o eliminar el video). */
  async discard(videoId: string): Promise<void> {
    const v = await this.prisma.academyVideo.findUnique({ where: { id: videoId }, select: { compatKey: true } });
    if (v?.compatKey) await this.media.remove(v.compatKey);
    await this.prisma.academyVideo
      .update({ where: { id: videoId }, data: { compatStatus: null, compatKey: null, compatSizeBytes: null, compatError: null } })
      .catch(() => undefined);
  }
}

/**
 * Cola de conversiones (BullMQ, worker en el mismo proceso de la API, de a uno).
 * Al arrancar encola los videos de la galería que nunca se revisaron (así también
 * se arreglan los que ya estaban subidos).
 */
@Injectable()
export class AcademyCompatQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AcademyCompatQueue.name);
  private queue?: Queue<{ videoId: string }>;
  private worker?: Worker<{ videoId: string }>;

  constructor(
    @Inject(MEDIA_CONFIG) private readonly config: MediaConfig | null,
    private readonly compat: AcademyCompatService,
    private readonly prisma: PrismaService,
  ) {}

  get enabled(): boolean {
    return Boolean(this.config?.compat);
  }

  async onModuleInit() {
    const c = this.config?.compat;
    if (!c) return;
    const connection = redisConnection(c.redisUrl);
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(QUEUE_NAME, (job) => this.compat.process(job.data.videoId), {
      connection,
      concurrency: 1,
      lockDuration: 10 * 60 * 1000, // se renueva solo mientras convierte
    });
    this.worker.on('failed', (job, err) => {
      if (!job) return;
      this.logger.warn(`Copia MP4 de ${job.data.videoId} falló (intento ${job.attemptsMade}): ${err.message}`);
      if (err instanceof CompatFileError || job.attemptsMade >= ATTEMPTS) {
        void this.compat.markFailed(job.data.videoId, err.message);
      }
    });
    this.worker.on('error', (err) => this.logger.error(`Worker de copias MP4: ${err.message}`));
    void this.backfill();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Videos de la galería sin revisar (subidos antes de esta función, o que quedaron colgados). */
  private async backfill(): Promise<void> {
    try {
      const rows = await this.prisma.academyVideo.findMany({
        where: {
          status: 'READY',
          location: 'GALLERY',
          mimeType: { startsWith: 'video/' },
          OR: [{ compatStatus: null }, { compatStatus: { in: ['PENDING', 'PROCESSING'] } }],
        },
        select: { id: true },
      });
      for (const r of rows) await this.enqueue(r.id);
      if (rows.length) this.logger.log(`Copias MP4 pendientes encoladas: ${rows.length}`);
    } catch (err) {
      this.logger.warn(`No se pudieron encolar las copias pendientes: ${(err as Error).message}`);
    }
  }

  /** Encola la copia de un video (no la duplica si ya está en cola). */
  async enqueue(videoId: string): Promise<void> {
    if (!this.queue) return; // apagada: el video se ve igual, sin copia
    await this.prisma.academyVideo.update({ where: { id: videoId }, data: { compatStatus: 'PENDING', compatError: null } });
    await this.queue.add(
      'compat',
      { videoId },
      {
        jobId: `compat-${videoId}`,
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
