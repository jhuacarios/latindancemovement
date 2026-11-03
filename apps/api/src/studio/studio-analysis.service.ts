import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AudioStorageService } from './audio-storage.service';
import { AnalyzerClient, AnalyzerFileError } from './analyzer.client';
import type { AnalyzerResultDto } from './dto/analyzer-result.dto';
import {
  FINGERPRINT_ITEM_MS,
  MATCH_DURATION_WINDOW_MS,
  MATCH_SIMILARITY,
  alignOffsetMs,
  compareFingerprints,
} from './fingerprint.util';
import { shiftEnergy, shiftTimes } from './timeline.util';

interface RecordingMatch {
  id: string;
  analyzerVersion: string | null;
  beatsMs: number[];
  coarseOffsetMs: number;
}

/** Compara versiones "x.y.z". */
function isNewerVersion(a: string, b: string | null): boolean {
  if (!b) return true;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * Procesa el análisis de un archivo (lo llama el worker de BullMQ): pide el
 * análisis al servicio Python, busca si la grabación ya existe (huella) y deja
 * el archivo vinculado a su RecordingAnalysis compartido.
 */
@Injectable()
export class StudioAnalysisService {
  private readonly logger = new Logger(StudioAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AudioStorageService,
    private readonly analyzer: AnalyzerClient,
  ) {}

  async process(audioFileId: string): Promise<void> {
    const file = await this.prisma.audioFile.findUnique({ where: { id: audioFileId } });
    if (!file) return; // lo borraron mientras esperaba en la cola

    await this.prisma.audioFile.update({
      where: { id: file.id },
      data: { status: 'PROCESSING', error: null },
    });

    let result: AnalyzerResultDto;
    try {
      result = await this.analyzer.analyze(await this.storage.analyzerUrl(file.storageKey));
    } catch (err) {
      if (err instanceof AnalyzerFileError) {
        // Problema del archivo: reintentar no sirve.
        await this.markFailed(file.id, err.message);
        return;
      }
      throw err; // BullMQ reintenta
    }

    const match = await this.findMatch(result);
    let recordingId: string;
    let align = 0;
    if (match) {
      align = alignOffsetMs(result.beatsMs, match.beatsMs, match.coarseOffsetMs);
      recordingId = match.id;
      // Un analizador más nuevo mejora la grabación para todos (en su línea de tiempo).
      if (isNewerVersion(result.analyzerVersion, match.analyzerVersion)) {
        await this.prisma.recordingAnalysis.update({
          where: { id: match.id },
          data: this.recordingData(result, -align),
        });
      }
    } else {
      const created = await this.prisma.recordingAnalysis.create({
        data: { ...this.recordingData(result, 0), fingerprint: result.fingerprint },
      });
      recordingId = created.id;
    }

    const previousRecordingId = file.recordingId;
    await this.prisma.$transaction([
      this.prisma.audioFile.update({
        where: { id: file.id },
        data: {
          recordingId,
          alignOffsetMs: align,
          durationMs: result.durationMs,
          status: 'READY',
          error: null,
        },
      }),
      // Secciones y marcas automáticas se copian a la capa del usuario; las MANUAL se respetan.
      this.prisma.songSection.deleteMany({ where: { audioFileId: file.id, origin: 'AUTOMATICO' } }),
      this.prisma.songMarker.deleteMany({ where: { audioFileId: file.id, origin: 'AUTOMATICO' } }),
      this.prisma.songSection.createMany({
        data: result.sections.map((s) => ({
          audioFileId: file.id,
          type: s.type,
          startMs: s.startMs,
          endMs: s.endMs,
          origin: 'AUTOMATICO',
        })),
      }),
      this.prisma.songMarker.createMany({
        data: result.markers.map((m) => ({
          audioFileId: file.id,
          type: m.type,
          timeMs: m.timeMs,
          origin: 'AUTOMATICO',
        })),
      }),
    ]);

    if (previousRecordingId && previousRecordingId !== recordingId) {
      await this.deleteRecordingIfOrphan(previousRecordingId);
    }
    this.logger.log(
      `Análisis listo: archivo ${file.id} → grabación ${recordingId}` +
        (match ? ` (reutilizada, desfase ${align} ms)` : ' (nueva)'),
    );
  }

  async markFailed(audioFileId: string, message: string): Promise<void> {
    await this.prisma.audioFile.updateMany({
      where: { id: audioFileId },
      data: { status: 'ERROR', error: message.slice(0, 500) },
    });
  }

  /** Borra la grabación compartida si ya ningún archivo la usa. */
  async deleteRecordingIfOrphan(recordingId: string): Promise<void> {
    const users = await this.prisma.audioFile.count({ where: { recordingId } });
    if (users === 0) {
      await this.prisma.recordingAnalysis.deleteMany({ where: { id: recordingId } });
    }
  }

  /** Busca una grabación ya analizada con la misma huella. */
  private async findMatch(result: AnalyzerResultDto): Promise<RecordingMatch | null> {
    if (result.fingerprint.length === 0) return null;
    const candidates = await this.prisma.recordingAnalysis.findMany({
      where: {
        status: 'DONE',
        durationMs: {
          gte: result.durationMs - MATCH_DURATION_WINDOW_MS,
          lte: result.durationMs + MATCH_DURATION_WINDOW_MS,
        },
      },
      select: { id: true, analyzerVersion: true, fingerprint: true, beatsMs: true },
    });

    let best: (RecordingMatch & { similarity: number }) | null = null;
    for (const c of candidates) {
      const fp = c.fingerprint as number[] | null;
      if (!fp?.length) continue;
      const m = compareFingerprints(result.fingerprint, fp);
      if (m.similarity >= MATCH_SIMILARITY && (!best || m.similarity > best.similarity)) {
        best = {
          id: c.id,
          analyzerVersion: c.analyzerVersion,
          beatsMs: (c.beatsMs as number[] | null) ?? [],
          // archivo[i] ≈ grabación[i + shift] → el archivo va `shift` ítems atrás.
          coarseOffsetMs: -m.shift * FINGERPRINT_ITEM_MS,
          similarity: m.similarity,
        };
      }
    }
    return best;
  }

  /** Datos de la grabación a partir del resultado de un archivo, llevados a la línea de tiempo de la grabación. */
  private recordingData(result: AnalyzerResultDto, shiftMs: number) {
    return {
      status: 'DONE',
      analyzerVersion: result.analyzerVersion,
      durationMs: result.durationMs,
      bpm: result.bpm,
      firstBeatOffsetMs: Math.max(0, result.firstBeatOffsetMs + shiftMs),
      beatsMs: shiftTimes(result.beatsMs, shiftMs),
      downbeatsMs: shiftTimes(result.downbeatsMs, shiftMs),
      energy: shiftEnergy(result.energy, shiftMs) as unknown as Prisma.InputJsonValue,
      sections: result.sections.map((s) => ({
        ...s,
        startMs: Math.max(0, s.startMs + shiftMs),
        endMs: Math.max(0, s.endMs + shiftMs),
      })) as unknown as Prisma.InputJsonValue,
      markers: result.markers.map((m) => ({
        ...m,
        timeMs: Math.max(0, m.timeMs + shiftMs),
      })) as unknown as Prisma.InputJsonValue,
      error: null,
    };
  }
}
