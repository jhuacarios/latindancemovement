import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';
import { StudioAnalysisService } from './studio-analysis.service';

const QUEUE_NAME = 'studio-analysis';
const INSTRUMENTS_QUEUE_NAME = 'studio-instruments';
const ATTEMPTS = 3;

interface AnalysisJob {
  audioFileId: string;
}

interface InstrumentsJob {
  recordingId: string;
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
 * Colas del Estudio. Los workers corren en el mismo proceso de la API con
 * concurrencia 1: el trabajo pesado lo hace el analizador Python.
 *  - studio-analysis: pulso, frases y energía de cada archivo (segundos).
 *  - studio-instruments: separación de instrumentos de cada grabación (minutos);
 *    va aparte para que el estudio de la canción no espere a la separación.
 */
@Injectable()
export class StudioQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StudioQueue.name);
  private queue?: Queue<AnalysisJob>;
  private worker?: Worker<AnalysisJob>;
  private instrumentsQueue?: Queue<InstrumentsJob>;
  private instrumentsWorker?: Worker<InstrumentsJob>;

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
      async (job) => {
        const recordingId = await this.analysis.process(job.data.audioFileId);
        if (recordingId) await this.enqueueInstruments(recordingId);
      },
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

    this.instrumentsQueue = new Queue<InstrumentsJob>(INSTRUMENTS_QUEUE_NAME, { connection });
    this.instrumentsWorker = new Worker<InstrumentsJob>(
      INSTRUMENTS_QUEUE_NAME,
      (job) => this.analysis.processInstruments(job.data.recordingId),
      // La separación puede tardar varios minutos: el lock se renueva solo, pero con margen.
      { connection, concurrency: 1, lockDuration: 5 * 60 * 1000 },
    );
    this.instrumentsWorker.on('failed', (job, err) => {
      if (!job) return;
      this.logger.warn(`Instrumentos ${job.data.recordingId} falló (intento ${job.attemptsMade}): ${err.message}`);
      if (job.attemptsMade >= ATTEMPTS) {
        void this.analysis.markInstrumentsFailed(
          job.data.recordingId,
          'No se pudieron detectar los instrumentos.',
        );
      }
    });
    this.instrumentsWorker.on('error', (err) => this.logger.error(`Worker de instrumentos: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.instrumentsWorker?.close();
    await this.instrumentsQueue?.close();
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

  /** Encola la separación de una grabación. Si ya está en cola o corriendo, no la duplica. */
  async enqueueInstruments(recordingId: string): Promise<void> {
    if (!this.instrumentsQueue) throw new Error('Cola de instrumentos no disponible.');
    await this.instrumentsQueue.add(
      'instruments',
      { recordingId },
      {
        jobId: `instruments-${recordingId}`,
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        // Se borran al terminar: si no, el jobId fijo impediría volver a encolarla.
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
