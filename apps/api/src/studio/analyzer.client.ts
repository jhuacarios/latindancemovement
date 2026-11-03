import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';
import { AnalyzerResultDto } from './dto/analyzer-result.dto';

/** El análisis de una canción completa puede tardar; con margen para Railway. */
const ANALYZE_TIMEOUT_MS = 5 * 60 * 1000;

/** Error del archivo (el analizador respondió 422): no tiene sentido reintentar. */
export class AnalyzerFileError extends Error {}

/** Cliente HTTP interno del servicio Python (apps/analyzer). */
@Injectable()
export class AnalyzerClient {
  constructor(@Inject(STUDIO_CONFIG) private readonly config: StudioConfig | null) {}

  async analyze(audioUrl: string): Promise<AnalyzerResultDto> {
    if (!this.config) throw new Error('Estudio no está configurado.');
    const res = await fetch(`${this.config.analyzer.url}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.analyzer.token}`,
      },
      body: JSON.stringify({ audioUrl, options: { separateStems: false } }),
      signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.status === 422) {
      const detail = (body as { detail?: unknown } | null)?.detail;
      throw new AnalyzerFileError(typeof detail === 'string' ? detail : 'Audio inválido.');
    }
    if (!res.ok) throw new Error(`El analizador respondió HTTP ${res.status}.`);

    const result = plainToInstance(AnalyzerResultDto, body);
    const errors = await validate(result);
    if (errors.length > 0) {
      throw new Error(`Respuesta inválida del analizador: ${errors.map((e) => e.property).join(', ')}`);
    }
    return result;
  }
}
