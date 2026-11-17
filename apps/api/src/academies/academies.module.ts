import { Module } from '@nestjs/common';
import { AcademiesController } from './academies.controller';
import { AcademiesService } from './academies.service';
import { AcademyVideosService } from './academy-videos.service';
import { AcademyShareService } from './academy-share.service';
import { AcademyCompatClient, AcademyCompatQueue, AcademyCompatService } from './academy-compat.service';
import { ShareController } from './share.controller';
import { MediaStorageService } from './media-storage.service';
import { MEDIA_CONFIG, loadMediaConfig } from './media.config';

@Module({
  controllers: [AcademiesController, ShareController],
  providers: [
    // Factory (no valor fijo): se evalúa después de que ConfigModule cargó el .env.
    { provide: MEDIA_CONFIG, useFactory: () => loadMediaConfig() },
    MediaStorageService,
    AcademiesService,
    AcademyVideosService,
    AcademyShareService,
    AcademyCompatClient,
    AcademyCompatService,
    AcademyCompatQueue,
  ],
})
export class AcademiesModule {}
