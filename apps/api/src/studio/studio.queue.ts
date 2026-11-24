import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../common/redis';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';
import { StudioAnalysisService } from './studio-analysis.service';

const QUEUE_NAME = 'studio-analysis';
const INSTRUMENTS_QUEUE_NAME = 'studio-instruments';
const ATTEMPTS = 3;

interface AnalysisJob {
  audioFileId: string;
}

/** Trabajos pesados (separación con Demucs): de a uno, en la misma cola. */
type HeavyJob =
  | { kind: 'instruments'; recordingId: string; background?: boolean }
  | { kind: 'stems'; audioFileId: string };
/** El análisis profundo de fondo va después de todo lo demás (BullMQ: mayor número = menos prioridad). */
const BACKGROUND_PRIORITY = 100;

export { redisConnection } from '../common/redis';

/**
 * Colas del Estudio. Los workers corren en el mismo proceso de la API con
 * concurrencia 1: el trabajo pesado lo hace el analizador Python.
 *  - studio-analysis: pulso, frases y energía de cada archivo (segundos).
 *  - studio-instruments: trabajos con Demucs (minutos), de a uno para no saturar
 *    la CPU: la actividad de instrumentos de cada grabación y las pistas del
 *    mezclador que pide un usuario. Va aparte para que el estudio no espere.
 */
@Injectable()
export class StudioQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StudioQueue.name);
  private queue?: Queue<AnalysisJob>;
  private worker?: Worker<AnalysisJob>;
  private instrumentsQueue?: Queue<HeavyJob>;
  private instrumentsWorker?: Worker<HeavyJob>;

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

    this.instrumentsQueue = new Queue<HeavyJob>(INSTRUMENTS_QUEUE_NAME, { connection });
    this.instrumentsWorker = new Worker<HeavyJob>(
      INSTRUMENTS_QUEUE_NAME,
      async (job) => {
        const d = job.data;
        if (d.kind === 'stems') return this.analysis.processStems(d.audioFileId);
        // Tras el análisis rápido, el profundo queda en cola con baja prioridad.
        if (await this.analysis.processInstruments(d.recordingId, d.background)) {
          await this.enqueueInstruments(d.recordingId, true);
        }
      },
      // La separación puede tardar varios minutos: el lock se renueva solo, pero con margen.
      { connection, concurrency: 1, lockDuration: 5 * 60 * 1000 },
    );
    this.instrumentsWorker.on('failed', (job, err) => {
      if (!job) return;
      const d = job.data;
      const what = d.kind === 'stems' ? `Pistas ${d.audioFileId}` : `Instrumentos ${d.recordingId}`;
      this.logger.warn(`${what} falló (intento ${job.attemptsMade}): ${err.message}`);
      if (job.attemptsMade < ATTEMPTS) return;
      if (d.kind === 'stems') {
        void this.analysis.markStemsFailed(d.audioFileId, 'No se pudieron separar las pistas.');
      } else {
        void this.analysis.markInstrumentsFailed(d.recordingId, 'No se pudieron detectar los instrumentos.');
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

  /**
   * Encola la separación de una grabación. Si ya está en cola o corriendo, no la duplica.
   * `background` = la pasada profunda tras la rápida: va al final de la cola.
   */
  async enqueueInstruments(recordingId: string, background = false): Promise<void> {
    if (!this.instrumentsQueue) throw new Error('Cola de instrumentos no disponible.');
    await this.addHeavy(
      { kind: 'instruments', recordingId, background },
      `instruments-${background ? 'deep-' : ''}${recordingId}`,
      background ? BACKGROUND_PRIORITY : undefined,
    );
  }

  /** Encola la separación en pistas de un archivo (mezclador). No la duplica. */
  async enqueueStems(audioFileId: string): Promise<void> {
    await this.addHeavy({ kind: 'stems', audioFileId }, `stems-${audioFileId}`);
  }

  private async addHeavy(data: HeavyJob, jobId: string, priority?: number): Promise<void> {
    if (!this.instrumentsQueue) throw new Error('Cola de instrumentos no disponible.');
    await this.instrumentsQueue.add(
      data.kind,
      data,
      {
        jobId,
        ...(priority ? { priority } : {}),
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        // Se borran al terminar: si no, el jobId fijo impediría volver a encolarla.
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
