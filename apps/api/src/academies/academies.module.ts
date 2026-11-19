import { Module } from '@nestjs/common';
import { AcademiesController } from './academies.controller';
import { AcademiesService } from './academies.service';
import { AcademyVideosService } from './academy-videos.service';
import { AcademyShareService } from './academy-share.service';
import { AcademyCompatClient, AcademyCompatQueue, AcademyCompatService } from './academy-compat.service';
import { ShareController } from './share.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  controllers: [AcademiesController, ShareController],
  providers: [
    AcademiesService,
    AcademyVideosService,
    AcademyShareService,
    AcademyCompatClient,
    AcademyCompatService,
    AcademyCompatQueue,
  ],
})
export class AcademiesModule {}
