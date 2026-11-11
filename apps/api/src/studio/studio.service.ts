import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AudioFile, RecordingAnalysis, SongMarker, SongSection } from '@prisma/client';
import {
  nearestBeatIndex,
  phraseStartIndexes,
  type AnalysisStatus,
  type AudioFileStatus,
  type AudioFileSummary,
  type DanceStyle,
  type SongInstruments,
  type SongMarkerDto,
  type SongSectionDto,
  type MarkOrigin,
  type SongEnergy,
  type SongMarkerType,
  type SongSectionType,
  type SongStudy,
  type StudioUploadTicket,
} from '@baile-latino/types';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TracksService } from '../music/tracks/tracks.service';
import { AudioStorageService } from './audio-storage.service';
import { StudioAnalysisService } from './studio-analysis.service';
import { StudioQueue } from './studio.queue';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';
import type { CreateUploadDto, SetFirstBeatDto } from './dto/studio.dto';
import { shiftEnergy, shiftInstruments, shiftTimes } from './timeline.util';
import { deriveBachataSections } from './bachata-sections.util';

type FileWithRecording = AudioFile & { recording: RecordingAnalysis | null };
type FileFull = FileWithRecording & { sections: SongSection[]; markers: SongMarker[] };

const FILE_FULL = {
  recording: true,
  sections: { orderBy: { startMs: 'asc' } },
  markers: { orderBy: { timeMs: 'asc' } },
} as const;

@Injectable()
export class StudioService {
  private readonly logger = new Logger(StudioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AudioStorageService,
    private readonly queue: StudioQueue,
    private readonly analysis: StudioAnalysisService,
    private readonly tracks: TracksService,
    @Inject(STUDIO_CONFIG) private readonly config: StudioConfig,
  ) {}

  /** Registra el archivo y devuelve la URL firmada para que el navegador lo suba directo al storage. */
  async createUpload(user: AuthUser, dto: CreateUploadDto): Promise<StudioUploadTicket> {
    if (dto.sizeBytes > this.config.maxUploadBytes) {
      throw new BadRequestException(
        `El archivo no puede superar ${Math.round(this.config.maxUploadBytes / 1024 / 1024)} MB.`,
      );
    }
    if (dto.trackId) await this.tracks.findOne(dto.trackId, user.id); // 404 si no existe

    const file = await this.prisma.audioFile.create({
      data: {
        userId: user.id,
        trackId: dto.trackId ?? null,
        storageKey: `audio/${user.id}/${randomUUID()}`,
        style: dto.style ?? 'BACHATA',
        originalName: dto.fileName,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        rightsAcceptedAt: new Date(),
      },
    });
    return {
      audioFileId: file.id,
      uploadUrl: await this.storage.uploadUrl(file.storageKey, file.mimeType),
      uploadHeaders: { 'Content-Type': file.mimeType },
    };
  }

  /** El navegador terminó de subir: se verifica que el archivo esté y se encola el análisis. */
  async completeUpload(user: AuthUser, id: string): Promise<AudioFileSummary> {
    const file = await this.owned(user, id);
    if (file.status !== 'UPLOADING') return this.toSummary(file); // idempotente

    const size = await this.storage.size(file.storageKey);
    if (size === null) throw new BadRequestException('El archivo no terminó de subir. Intenta de nuevo.');
    if (size > this.config.maxUploadBytes) {
      await this.removeFile(file);
      throw new BadRequestException('El archivo supera el tamaño máximo.');
    }

    const updated = await this.prisma.audioFile.update({
      where: { id: file.id },
      data: { status: 'QUEUED', sizeBytes: size },
      include: { recording: true },
    });
    await this.queue.enqueue(file.id);
    return this.toSummary(updated);
  }

  async list(user: AuthUser, style?: DanceStyle): Promise<AudioFileSummary[]> {
    const files = await this.prisma.audioFile.findMany({
      where: { userId: user.id, status: { not: 'UPLOADING' }, ...(style ? { style } : {}) },
      include: { recording: true },
      orderBy: { createdAt: 'desc' },
    });
    return files.map((f) => this.toSummary(f));
  }

  async findOne(user: AuthUser, id: string): Promise<SongStudy> {
    return this.toStudy(await this.ownedFull(user, id));
  }

  async playbackUrl(user: AuthUser, id: string): Promise<{ url: string }> {
    const file = await this.owned(user, id);
    if (file.status === 'UPLOADING') throw new ConflictException('El archivo todavía no se subió.');
    return { url: await this.storage.playbackUrl(file.storageKey) };
  }

  async reanalyze(user: AuthUser, id: string): Promise<AudioFileSummary> {
    const file = await this.owned(user, id);
    if (file.status === 'UPLOADING' || file.status === 'QUEUED' || file.status === 'PROCESSING') {
      throw new ConflictException('Este audio ya está en proceso.');
    }
    const updated = await this.prisma.audioFile.update({
      where: { id: file.id },
      data: { status: 'QUEUED', error: null },
      include: { recording: true },
    });
    await this.queue.enqueue(file.id);
    return this.toSummary(updated);
  }

  /** Corrige el "1": se ajusta al beat más cercano y toda la grilla de frases se recalcula. */
  async setFirstBeat(user: AuthUser, id: string, dto: SetFirstBeatDto): Promise<SongStudy> {
    const file = await this.ownedFull(user, id);
    let value: number | null = null;
    if (dto.timeMs !== null) {
      const beats = this.fileBeats(file);
      if (beats.length === 0) throw new ConflictException('Este audio todavía no tiene análisis.');
      value = beats[nearestBeatIndex(beats, dto.timeMs)];
    }
    const updated = await this.prisma.audioFile.update({
      where: { id: file.id },
      data: { firstBeatOffsetMs: value },
      include: FILE_FULL,
    });
    return this.toStudy(updated);
  }

  /** Borrado completo (Ley 21.719): audio en el storage, archivo, secciones, marcas y, si queda sola, la grabación. */
  async remove(user: AuthUser, id: string): Promise<{ id: string; deleted: true }> {
    const file = await this.owned(user, id);
    await this.removeFile(file);
    return { id: file.id, deleted: true };
  }

  // --- helpers -------------------------------------------------------------

  private async removeFile(file: AudioFile) {
    try {
      await this.storage.remove(file.storageKey);
    } catch (err) {
      // No bloquea el borrado del usuario; queda en el log para limpiar a mano.
      this.logger.error(`No se pudo borrar ${file.storageKey} del storage: ${(err as Error).message}`);
    }
    await this.prisma.audioFile.delete({ where: { id: file.id } });
    if (file.recordingId) await this.analysis.deleteRecordingIfOrphan(file.recordingId);
  }

  /** Archivo del usuario. 404 también si es de otro (no revela que existe). */
  private async owned(user: AuthUser, id: string): Promise<FileWithRecording> {
    const file = await this.prisma.audioFile.findFirst({
      where: { id, userId: user.id },
      include: { recording: true },
    });
    if (!file) throw new NotFoundException('Audio no encontrado.');
    return file;
  }

  private async ownedFull(user: AuthUser, id: string): Promise<FileFull> {
    const file = await this.prisma.audioFile.findFirst({
      where: { id, userId: user.id },
      include: FILE_FULL,
    });
    if (!file) throw new NotFoundException('Audio no encontrado.');
    return file;
  }

  /** Beats de la grabación llevados a la línea de tiempo de este archivo. */
  private fileBeats(file: FileWithRecording): number[] {
    const beats = (file.recording?.beatsMs as number[] | null) ?? [];
    return shiftTimes(beats, file.alignOffsetMs, file.durationMs ?? undefined);
  }

  private toSummary(file: FileWithRecording): AudioFileSummary {
    return {
      id: file.id,
      style: file.style as DanceStyle,
      originalName: file.originalName,
      status: file.status as AudioFileStatus,
      error: file.error,
      durationMs: file.durationMs ?? file.recording?.durationMs ?? null,
      bpm: file.recording?.bpm ?? null,
      trackId: file.trackId,
      createdAt: file.createdAt.toISOString(),
    };
  }

  private toStudy(file: FileFull): SongStudy {
    const rec = file.recording;
    const align = file.alignOffsetMs;
    const beatsMs = this.fileBeats(file);
    const downbeatsMs = shiftTimes(
      (rec?.downbeatsMs as number[] | null) ?? [],
      align,
      file.durationMs ?? undefined,
    );
    const autoFirst = rec?.firstBeatOffsetMs != null ? rec.firstBeatOffsetMs + align : null;
    const firstBeatOffsetMs = file.firstBeatOffsetMs ?? autoFirst;
    const energy = rec?.energy ? shiftEnergy(rec.energy as unknown as SongEnergy, align) : null;
    const phraseStarts = phraseStartIndexes(beatsMs, firstBeatOffsetMs);

    // Instrumentos: por ahora solo el estudio de bachata los usa.
    const usesInstruments = file.style === 'BACHATA' && rec !== null;
    const instruments =
      usesInstruments && rec.instrumentsStatus === 'DONE' && rec.instruments
        ? shiftInstruments(rec.instruments as unknown as SongInstruments, align)
        : null;

    const sections: SongSectionDto[] = file.sections.map((s) => ({
      id: s.id,
      type: s.type as SongSectionType,
      startMs: s.startMs,
      endMs: s.endMs,
      label: s.label,
      origin: s.origin as MarkOrigin,
    }));
    const markers: SongMarkerDto[] = file.markers.map((m) => ({
      id: m.id,
      type: m.type as SongMarkerType,
      timeMs: m.timeMs,
      text: m.text,
      origin: m.origin as MarkOrigin,
    }));

    // Secciones automáticas: se calculan al vuelo (siguen al "1" si el usuario lo corrige)
    // y solo si el usuario no marcó las suyas.
    if (instruments && file.durationMs) {
      const auto = deriveBachataSections(beatsMs, phraseStarts, instruments, file.durationMs);
      if (sections.length === 0) {
        sections.push(
          ...auto.sections.map((s, i) => ({ id: `auto-${i}`, ...s, label: null, origin: 'AUTOMATICO' as const })),
        );
      }
      markers.push(
        ...auto.markers.map((m, i) => ({ id: `auto-${i}`, ...m, text: null, origin: 'AUTOMATICO' as const })),
      );
      markers.sort((a, b) => a.timeMs - b.timeMs);
    }

    return {
      ...this.toSummary(file),
      analyzerVersion: rec?.analyzerVersion ?? null,
      beatsMs,
      downbeatsMs,
      firstBeatOffsetMs,
      firstBeatCorrected: file.firstBeatOffsetMs !== null,
      phraseStartIndexes: phraseStarts,
      energy,
      instrumentsStatus: usesInstruments ? (rec.instrumentsStatus as AnalysisStatus) : null,
      instruments,
      sections,
      markers,
    };
  }
}
