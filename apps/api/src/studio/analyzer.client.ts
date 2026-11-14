import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { INSTRUMENT_KEYS } from '@baile-latino/types';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';
import { AnalyzerInstrumentsDto, AnalyzerResultDto } from './dto/analyzer-result.dto';

/** El análisis de una canción completa puede tardar. */
const ANALYZE_TIMEOUT_MS = 5 * 60 * 1000;
/** La separación de instrumentos es más lenta (~5 min por canción con 2 CPU; hasta 10 min de audio). */
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

  /** Separa y sube las pistas a las URLs firmadas que se le pasan. */
  async stems(audioUrl: string, uploads: Record<string, string>): Promise<void> {
    await this.post('/stems', { audioUrl, uploads }, INSTRUMENTS_TIMEOUT_MS);
  }

  private async post(path: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    if (!this.config) throw new Error('Estudio no está configurado.');
    const res = await postJson(
      `${this.config.analyzer.url}${path}`,
      payload,
      { Authorization: `Bearer ${this.config.analyzer.token}` },
      timeoutMs,
    );
    if (res.status === 422) {
      const detail = (res.body as { detail?: unknown } | null)?.detail;
      throw new AnalyzerFileError(typeof detail === 'string' ? detail : 'Audio inválido.');
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`El analizador respondió HTTP ${res.status}.`);
    return res.body;
  }
}

/**
 * POST JSON con node:http. No se usa `fetch` porque su cliente (undici) corta
 * cualquier respuesta que tarde más de 5 min en llegar (headersTimeout), aunque se
 * le pase un AbortSignal más largo; la separación de instrumentos tarda más que eso.
 */
function postJson(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const data = Buffer.from(JSON.stringify(payload));
  const target = new URL(url);
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      target,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': data.length },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          let body: unknown = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            body = null;
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`El analizador no respondió en ${Math.round(timeoutMs / 60000)} min.`)));
    req.on('error', reject);
    req.end(data);
  });
}
