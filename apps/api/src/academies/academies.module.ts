import { Module } from '@nestjs/common';
import { AcademiesController } from './academies.controller';
import { AcademiesService } from './academies.service';
import { AcademyVideosService } from './academy-videos.service';
import { AcademyShareService } from './academy-share.service';
import { AcademyCompatClient, AcademyCompatQueue, AcademyCompatService } from './academy-compat.service';
import { ShareController } from './share.controller';
import { MediaModule } from '../media/media.module';
import { ChatModule } from '../chat/chat.module';
import { AcademyEnrollmentsService } from './academy-enrollments.service';

@Module({
  imports: [MediaModule, ChatModule],
  controllers: [AcademiesController, ShareController],
  providers: [
    AcademiesService,
    AcademyVideosService,
    AcademyShareService,
    AcademyEnrollmentsService,
    AcademyCompatClient,
    AcademyCompatService,
    AcademyCompatQueue,
  ],
  // StickersModule: quién administra una academia y a cuáles pertenece un usuario.
  exports: [AcademiesService],
})
export class AcademiesModule {}
