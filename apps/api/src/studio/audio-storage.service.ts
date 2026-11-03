import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { STUDIO_CONFIG, type StudioConfig } from './studio.config';

/** Duración de las URLs firmadas (cortas: el audio es privado). */
const UPLOAD_URL_TTL_SEC = 15 * 60;
const PLAYBACK_URL_TTL_SEC = 60 * 60;
const ANALYZER_URL_TTL_SEC = 15 * 60;

/**
 * Storage S3-compatible del audio de Estudio (Cloudflare R2 en prod, SeaweedFS en
 * local). Bucket PRIVADO: todo acceso es por URL firmada de corta duración.
 */
@Injectable()
export class AudioStorageService implements OnModuleInit {
  private readonly logger = new Logger(AudioStorageService.name);
  private readonly client!: S3Client;
  /** Solo firma URLs para el analizador (otro host en local; el mismo en prod). */
  private readonly analyzerSigner!: S3Client;
  private readonly config!: StudioConfig;

  constructor(@Inject(STUDIO_CONFIG) config: StudioConfig | null) {
    if (!config) return; // módulo apagado: StudioEnabledGuard corta antes de llegar acá
    this.config = config;
    const base = {
      region: config.s3.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
      // R2 no soporta los checksums CRC que el SDK agrega por defecto a las URLs firmadas.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.client = new S3Client({ ...base, endpoint: config.s3.endpoint });
    this.analyzerSigner = new S3Client({ ...base, endpoint: config.s3.analyzerEndpoint });
  }

  /** En desarrollo crea el bucket si no existe (en prod se crea a mano en R2). */
  async onModuleInit() {
    if (!this.config || process.env.NODE_ENV === 'production') return;
    const Bucket = this.config.s3.bucket;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket }));
        this.logger.log(`Bucket de audio creado: ${Bucket}`);
      } catch (err) {
        this.logger.warn(`No se pudo crear el bucket ${Bucket}: ${(err as Error).message}`);
      }
    }
  }

  uploadUrl(key: string, mimeType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.config.s3.bucket, Key: key, ContentType: mimeType }),
      { expiresIn: UPLOAD_URL_TTL_SEC },
    );
  }

  playbackUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.s3.bucket, Key: key }),
      { expiresIn: PLAYBACK_URL_TTL_SEC },
    );
  }

  analyzerUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.analyzerSigner,
      new GetObjectCommand({ Bucket: this.config.s3.bucket, Key: key }),
      { expiresIn: ANALYZER_URL_TTL_SEC },
    );
  }

  /** Tamaño del objeto subido, o null si no existe. */
  async size(key: string): Promise<number | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.s3.bucket, Key: key }),
      );
      return res.ContentLength ?? 0;
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.s3.bucket, Key: key }));
  }
}
