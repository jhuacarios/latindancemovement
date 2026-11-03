/**
 * Configuración del módulo Estudio. Si falta algo (storage, Redis o analizador),
 * el módulo queda APAGADO: la API arranca igual y sus rutas responden 503. Así
 * un deploy sin esas variables no rompe el resto de la plataforma.
 */
export interface StudioConfig {
  s3: {
    endpoint: string;
    /** Endpoint con que se firman las URLs que baja el analizador (en local, el nombre del contenedor). */
    analyzerEndpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  redisUrl: string;
  analyzer: { url: string; token: string };
  maxUploadBytes: number;
}

export const STUDIO_CONFIG = Symbol('STUDIO_CONFIG');

export function loadStudioConfig(env: NodeJS.ProcessEnv = process.env): StudioConfig | null {
  const required = [
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'REDIS_URL',
    'ANALYZER_URL',
    'ANALYZER_TOKEN',
  ];
  if (required.some((k) => !env[k])) return null;
  return {
    s3: {
      endpoint: env.S3_ENDPOINT!,
      analyzerEndpoint: env.S3_ANALYZER_ENDPOINT || env.S3_ENDPOINT!,
      region: env.S3_REGION || 'auto',
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    redisUrl: env.REDIS_URL!,
    analyzer: { url: env.ANALYZER_URL!.replace(/\/$/, ''), token: env.ANALYZER_TOKEN! },
    maxUploadBytes: Number(env.STUDIO_MAX_UPLOAD_MB || 30) * 1024 * 1024,
  };
}
