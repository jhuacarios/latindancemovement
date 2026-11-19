/**
 * Storage de media (fotos y videos de academias y de los sociales; luego eventos). Usa
 * el mismo endpoint y credenciales S3 que el Estudio, con OTRO bucket privado
 * (S3_MEDIA_BUCKET). Si falta algo, solo los archivos responden 503: el resto de
 * Academias funciona igual.
 */
export interface MediaConfig {
  endpoint: string;
  /** Endpoint con que se firman las URLs que usa el analizador (en local, el nombre del contenedor). */
  analyzerEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Conversión a MP4 compatible (la hace el analizador Python, en cola con Redis).
   * null = apagada: los videos se ven igual, solo que sin copia compatible.
   */
  compat: { redisUrl: string; analyzerUrl: string; analyzerToken: string } | null;
}

export const MEDIA_CONFIG = Symbol('MEDIA_CONFIG');

export function loadMediaConfig(env: NodeJS.ProcessEnv = process.env): MediaConfig | null {
  const required = ['S3_ENDPOINT', 'S3_MEDIA_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
  if (required.some((k) => !env[k])) return null;
  const compatOn = Boolean(env.REDIS_URL && env.ANALYZER_URL && env.ANALYZER_TOKEN);
  return {
    endpoint: env.S3_ENDPOINT!,
    analyzerEndpoint: env.S3_ANALYZER_ENDPOINT || env.S3_ENDPOINT!,
    region: env.S3_REGION || 'auto',
    bucket: env.S3_MEDIA_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    compat: compatOn
      ? {
          redisUrl: env.REDIS_URL!,
          analyzerUrl: env.ANALYZER_URL!.replace(/\/$/, ''),
          analyzerToken: env.ANALYZER_TOKEN!,
        }
      : null,
  };
}
