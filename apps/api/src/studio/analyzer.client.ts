import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { INSTRUMENT_KEYS } from '@baile-latino/types';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';
import { AnalyzerInstrumentsDto, AnalyzerResultDto } from './dto/analyzer-result.dto';

/** El análisis de una canción completa puede tardar. */
const ANALYZE_TIMEOUT_MS = 5 * 60 * 1000;
/** La separación de instrumentos es más lenta (~2 min por canción con 4 CPU; hasta 10 min de audio). */
const INSTRUMENTS_TIMEOUT_MS = 20 * 60 * 1000;

/** Error del archivo (el analizador respondió 422): no tiene sentido reintentar. */
export class AnalyzerFileError extends Error {}

/** Cliente HTTP interno del servicio Python (apps/analyzer). */
@Injectable()
export class AnalyzerClient {
  constructor(@Inject(STUDIO_CONFIG) private readonly config: StudioConfig | null) {}

  async analyze(audioUrl: string): Promise<AnalyzerResultDto> {
    const body = await this.post('/analyze', { audioUrl, options: { separateStems: false } }, ANALYZE_TIMEOUT_MS);
    const result = plainToInstance(AnalyzerResultDto, body);
    const errors = await validate(result);
    if (errors.length > 0) {
      throw new Error(`Respuesta inválida del analizador: ${errors.map((e) => e.property).join(', ')}`);
    }
    return result;
  }

  async instruments(audioUrl: string): Promise<AnalyzerInstrumentsDto> {
    const body = await this.post('/instruments', { audioUrl }, INSTRUMENTS_TIMEOUT_MS);
    const result = plainToInstance(AnalyzerInstrumentsDto, body);
    const errors = await validate(result);
    const tracks = result?.tracks as Record<string, unknown> | undefined;
    const badTracks =
      !tracks ||
      INSTRUMENT_KEYS.some(
        (k) => !Array.isArray(tracks[k]) || (tracks[k] as unknown[]).some((v) => typeof v !== 'number'),
      );
    if (errors.length > 0 || badTracks) {
      const props = [...errors.map((e) => e.property), ...(badTracks ? ['tracks'] : [])];
      throw new Error(`Respuesta inválida del analizador: ${props.join(', ')}`);
    }
    return result;
  }

  private async post(path: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    if (!this.config) throw new Error('Estudio no está configurado.');
    const res = await fetch(`${this.config.analyzer.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.analyzer.token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.status === 422) {
      const detail = (body as { detail?: unknown } | null)?.detail;
      throw new AnalyzerFileError(typeof detail === 'string' ? detail : 'Audio inválido.');
    }
    if (!res.ok) throw new Error(`El analizador respondió HTTP ${res.status}.`);
    return body;
  }
}
