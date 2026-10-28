import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  CHILE_REGIONS,
  CHILE_REGION_CODES,
  DANCE_STYLES,
  type ChileRegion,
  type DanceStyle,
  type FlyerExtraction,
} from '@baile-latino/types';

type FlyerMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const MODEL = 'claude-opus-5';
const TZ = 'America/Santiago';

const Confidence = z.enum(['high', 'medium', 'low']);

const ExtractionSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  endTime: z.string().nullable(),
  venueName: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  region: z
    .enum(CHILE_REGION_CODES as [ChileRegion, ...ChileRegion[]])
    .nullable(),
  styles: z.array(z.enum(DANCE_STYLES as unknown as [DanceStyle, ...DanceStyle[]])),
  bachataPct: z.number().int().min(0).max(100).nullable(),
  priceInfo: z.string().nullable(),
  ticketUrl: z.string().nullable(),
  instagramUrl: z.string().nullable(),
  organizerName: z.string().nullable(),
  organizerInstagram: z.string().nullable(),
  confidence: z.object({
    date: Confidence,
    venue: Confidence,
    region: Confidence,
    prices: Confidence,
  }),
  notes: z.string().nullable(),
});

// Prompt estable (sin fecha ni datos variables) para que se cachee entre llamadas.
const SYSTEM_PROMPT = `Eres el asistente de Nectason, una plataforma para la comunidad de baile social latino (bachata y salsa) en Chile.
Tu tarea: leer el flyer de un evento (imagen) y, si viene, el texto del post de Instagram, y extraer los datos del evento en el formato pedido.

Reglas:
- Devuelve null en cualquier campo que no aparezca. NUNCA inventes datos.
- Fechas: resuelve expresiones relativas ("este viernes", "mañana", "sábado 14") usando la fecha de hoy que te doy en el mensaje. Si el flyer no indica año, usa el próximo en que esa fecha aún no haya pasado. Formato YYYY-MM-DD.
- Horas en formato 24h HH:mm. "22 hrs", "22:00", "10 pm" → "22:00".
- region: código de la región de Chile donde ocurre el evento, deducida de la ciudad/comuna/venue. Comunas del Gran Santiago (Providencia, Ñuñoa, Las Condes, Santiago Centro, Maipú, La Florida, etc.) → METROPOLITANA. Viña del Mar, Valparaíso, Quilpué, Villa Alemana, Concón, Reñaca → VALPARAISO. Concepción, Talcahuano, San Pedro, Chillán es NUBLE. Si no puedes deducirla, null.
- city: la ciudad o comuna tal como se entiende en Chile (ej. "Viña del Mar", "Providencia").
- styles: incluye BACHATA y/o SALSA según lo que se bailará. Si dice "bachata y salsa", ambos. Si dice "kizomba" o "zouk" solo, deja el arreglo vacío.
- bachataPct: si el flyer indica proporción (ej. "70% bachata 30% salsa", "100% bachata"), pon el % de bachata; si no, null.
- priceInfo: resume TODOS los precios y preventas en una línea, con el formato chileno "$5.000". Ej: "Preventa 1 $5.000 · Preventa 2 $7.000 · Puerta $9.000". Si dice "entrada liberada" o "gratis", pon "Entrada liberada".
- ticketUrl: link de venta de entradas (Passline, Puntoticket, formulario, etc.) si aparece.
- instagramUrl: link al post de Instagram si viene en el texto; si no, null.
- organizerInstagram: el handle sin @ del organizador o productora (ej. "bachatalovers.cl").
- title: el nombre del evento tal como aparece (ej. "Social de Playa — Reñaca"). Si no hay nombre, arma uno corto y descriptivo con estilo + lugar (ej. "Social de bachata en Bar Tropical").
- description: 1 a 3 frases con lo relevante que no cabe en otros campos (DJs, artistas, dress code, clase previa, etc.). Sin emojis.
- confidence: "high" si el dato aparece explícito y sin ambigüedad; "medium" si lo dedujiste (ej. año, región desde la comuna); "low" si es una suposición o falta.
- notes: en español, breve, solo si hay algo que el organizador debería revisar (fecha ambigua, dos precios contradictorios, texto ilegible). Si no, null.`;

@Injectable()
export class FlyerExtractService {
  private readonly logger = new Logger(FlyerExtractService.name);
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException(
        'La lectura automática de flyers no está configurada (falta ANTHROPIC_API_KEY). Puedes llenar el formulario a mano.',
      );
    }
    this.client ??= new Anthropic();
    return this.client;
  }

  /** Fecha de hoy en Chile, en un formato que el modelo pueda usar sin ambigüedad. */
  private todayInChile(): string {
    const now = new Date();
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const weekday = new Intl.DateTimeFormat('es-CL', {
      timeZone: TZ,
      weekday: 'long',
    }).format(now);
    return `${weekday} ${ymd}`;
  }

  async extract(
    image: { buffer: Buffer; mime: string },
    text?: string | null,
  ): Promise<FlyerExtraction> {
    const client = this.getClient();
    const regionsHint = CHILE_REGIONS.map((r) => `${r.code} = ${r.name}`).join(
      ', ',
    );
    const userText = [
      `Hoy es ${this.todayInChile()} (hora de Chile).`,
      `Códigos de región válidos: ${regionsHint}.`,
      text?.trim()
        ? `Texto del post de Instagram:\n"""\n${text.trim()}\n"""`
        : 'No hay texto adicional: usa solo el flyer.',
      'Extrae los datos del evento.',
    ].join('\n\n');

    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mime as FlyerMime,
                  data: image.buffer.toString('base64'),
                },
              },
              { type: 'text', text: userText },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(ExtractionSchema) },
      });

      if (response.stop_reason === 'refusal') {
        throw new BadGatewayException(
          'El modelo no pudo procesar esta imagen. Prueba con otro flyer o llena el formulario a mano.',
        );
      }
      const parsed = response.parsed_output;
      if (!parsed) {
        this.logger.warn(
          `Respuesta sin JSON válido (stop_reason=${response.stop_reason})`,
        );
        throw new BadGatewayException(
          'No se pudo interpretar el flyer. Intenta de nuevo o llena el formulario a mano.',
        );
      }
      this.logger.log(
        `Flyer leído · in=${response.usage.input_tokens} cached=${response.usage.cache_read_input_tokens ?? 0} out=${response.usage.output_tokens}`,
      );
      return parsed;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ServiceUnavailableException(
          'La ANTHROPIC_API_KEY configurada no es válida.',
        );
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new ServiceUnavailableException(
          'El lector de flyers está saturado. Intenta en un minuto.',
        );
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic ${err.status}: ${err.message}`);
        throw new BadGatewayException(
          'Error al leer el flyer. Intenta de nuevo o llena el formulario a mano.',
        );
      }
      throw err;
    }
  }
}
