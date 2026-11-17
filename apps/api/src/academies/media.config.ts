/**
 * Storage de media (videos de academias; luego la galería de eventos). Usa el
 * mismo endpoint y credenciales S3 que el Estudio, con OTRO bucket privado
 * (S3_MEDIA_BUCKET). Si falta algo, solo los videos responden 503: el resto de
 * Academias funciona igual.
 */
export interface MediaConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export const MEDIA_CONFIG = Symbol('MEDIA_CONFIG');

export function loadMediaConfig(env: NodeJS.ProcessEnv = process.env): MediaConfig | null {
  const required = ['S3_ENDPOINT', 'S3_MEDIA_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
  if (required.some((k) => !env[k])) return null;
  return {
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION || 'auto',
    bucket: env.S3_MEDIA_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  };
}
