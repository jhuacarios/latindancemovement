import { Module } from '@nestjs/common';
import { MediaStorageService } from './media-storage.service';
import { MEDIA_CONFIG, loadMediaConfig } from './media.config';

/**
 * Almacenamiento de media (bucket privado S3/R2, `S3_MEDIA_BUCKET`): lo usan las
 * academias (`academies/<id>/…`) y los sociales (`places/<id>/…`). Cada módulo
 * guarda sus registros en sus propias tablas; acá solo se habla con el bucket.
 */
@Module({
  providers: [
    // Factory (no valor fijo): se evalúa después de que ConfigModule cargó el .env.
    { provide: MEDIA_CONFIG, useFactory: () => loadMediaConfig() },
    MediaStorageService,
  ],
  exports: [MediaStorageService, MEDIA_CONFIG],
})
export class MediaModule {}
