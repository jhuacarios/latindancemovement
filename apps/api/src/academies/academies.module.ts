import { Module } from '@nestjs/common';
import { AcademiesController } from './academies.controller';
import { AcademiesService } from './academies.service';
import { AcademyVideosService } from './academy-videos.service';
import { MediaStorageService } from './media-storage.service';
import { MEDIA_CONFIG, loadMediaConfig } from './media.config';

@Module({
  controllers: [AcademiesController],
  providers: [
    // Factory (no valor fijo): se evalúa después de que ConfigModule cargó el .env.
    { provide: MEDIA_CONFIG, useFactory: () => loadMediaConfig() },
    MediaStorageService,
    AcademiesService,
    AcademyVideosService,
  ],
})
export class AcademiesModule {}
