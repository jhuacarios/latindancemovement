import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';
import { StudioAnalysisService } from './studio-analysis.service';

const QUEUE_NAME = 'studio-analysis';
const ATTEMPTS = 3;

interface AnalysisJob {
  audioFileId: string;
}

/** redis://user:pass@host:port/db → opciones de ioredis (BullMQ exige maxRetriesPerRequest: null). */
export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Cola de análisis. El worker corre en el mismo proceso de la API con
 * concurrencia 1: el trabajo pesado lo hace el analizador Python, que procesa
 * de a una canción.
 */
@Injectable()
export class StudioQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StudioQueue.name);
  private queue?: Queue<AnalysisJob>;
  private worker?: Worker<AnalysisJob>;

  constructor(
    @Inject(STUDIO_CONFIG) private readonly config: StudioConfig | null,
    private readonly analysis: StudioAnalysisService,
  ) {}

  onModuleInit() {
    if (!this.config) return;
    const connection = redisConnection(this.config.redisUrl);
    this.queue = new Queue<AnalysisJob>(QUEUE_NAME, { connection });
    this.worker = new Worker<AnalysisJob>(
      QUEUE_NAME,
      (job) => this.analysis.process(job.data.audioFileId),
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      if (!job) return;
      this.logger.warn(`Análisis ${job.data.audioFileId} falló (intento ${job.attemptsMade}): ${err.message}`);
      if (job.attemptsMade >= ATTEMPTS) {
        void this.analysis.markFailed(
          job.data.audioFileId,
          'No se pudo analizar el audio. Intenta de nuevo en unos minutos.',
        );
      }
    });
    this.worker.on('error', (err) => this.logger.error(`Worker de análisis: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueue(audioFileId: string): Promise<void> {
    if (!this.queue) throw new Error('Cola de análisis no disponible.');
    await this.queue.add(
      'analyze',
      { audioFileId },
      {
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }
}
