import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MEDIA_CONFIG, type MediaConfig } from './media.config';

/** Subir un video de 3 GB con mala conexión puede tardar: margen amplio. */
const UPLOAD_URL_TTL_SEC = 6 * 60 * 60;
const VIEW_URL_TTL_SEC = 60 * 60;

/**
 * Bucket PRIVADO de media (R2 en prod, SeaweedFS en local). Todo acceso es por
 * URL firmada: el navegador sube directo y reproduce directo (sin pasar por la API).
 */
@Injectable()
export class MediaStorageService implements OnModuleInit {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly client: S3Client | null = null;

  constructor(@Inject(MEDIA_CONFIG) private readonly config: MediaConfig | null) {
    if (!config) return;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // R2 no soporta los checksums CRC que el SDK agrega por defecto a las URLs firmadas.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** En desarrollo crea el bucket si no existe (en prod se crea a mano en R2). */
  async onModuleInit() {
    if (!this.client || process.env.NODE_ENV === 'production') return;
    const Bucket = this.config!.bucket;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket }));
        this.logger.log(`Bucket de media creado: ${Bucket}`);
      } catch (err) {
        this.logger.warn(`No se pudo crear el bucket ${Bucket}: ${(err as Error).message}`);
      }
    }
  }

  /** 503 si el storage de media no está configurado. */
  assertEnabled(): void {
    void this.s3;
  }

  private get s3(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException('Los videos todavía no están disponibles en este entorno.');
    }
    return this.client;
  }

  uploadUrl(key: string, mimeType: string): Promise<string> {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.config!.bucket, Key: key, ContentType: mimeType }), {
      expiresIn: UPLOAD_URL_TTL_SEC,
    });
  }

  /** URL firmada que el navegador DESCARGA (no reproduce) con el nombre dado. */
  downloadUrl(key: string, fileName: string): Promise<string> {
    const ascii = fileName.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'archivo';
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.config!.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      }),
      { expiresIn: VIEW_URL_TTL_SEC },
    );
  }

  /**
   * Copia un objeto dentro del bucket cambiando su clase de almacenamiento:
   * STANDARD_IA = R2 Infrequent Access (la bóveda: más barata por GB, cobra por
   * descargar y 30 días mínimos), STANDARD = normal. Sirve para objetos de hasta 5 GB.
   */
  async copy(fromKey: string, toKey: string, storageClass: 'STANDARD' | 'STANDARD_IA'): Promise<void> {
    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.config!.bucket,
        Key: toKey,
        CopySource: `${this.config!.bucket}/${fromKey.split('/').map(encodeURIComponent).join('/')}`,
        StorageClass: storageClass,
      }),
    );
  }

  viewUrl(key: string): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.config!.bucket, Key: key }), {
      expiresIn: VIEW_URL_TTL_SEC,
    });
  }

  /** Tamaño del objeto, o null si no existe. */
  async size(key: string): Promise<number | null> {
    try {
      const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.config!.bucket, Key: key }));
      return res.ContentLength ?? 0;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      return null;
    }
  }

  /** Borra sin fallar si no existe (o si el storage está apagado). */
  async remove(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config!.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`No se pudo borrar ${key}: ${(err as Error).message}`);
    }
  }
}
