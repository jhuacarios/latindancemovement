import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { CommunityModule } from '../community/community.module';
import { StickersController } from './stickers.controller';
import { StickersService } from './stickers.service';

/** Stickers para el chat: packs de Nectason, de academias y de sociales. */
@Module({
  imports: [AcademiesModule, CommunityModule],
  controllers: [StickersController],
  providers: [StickersService],
})
export class StickersModule {}
