import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { CommunityModule } from '../community/community.module';
import { StickersController } from './stickers.controller';
import { StickersService } from './stickers.service';
import { StickerCutoutService } from './sticker-cutout.service';

/** Stickers para el chat: packs de Nectason, de academias y de sociales. */
@Module({
  imports: [AcademiesModule, CommunityModule],
  controllers: [StickersController],
  providers: [StickersService, StickerCutoutService],
})
export class StickersModule {}
