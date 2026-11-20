import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { MediaModule } from '../media/media.module';
import { PlaceMediaController } from './place-media.controller';
import { PlaceMediaService } from './place-media.service';
import { CommunityPlacesController } from './community-places.controller';
import { CommunityPlacesService } from './community-places.service';
import { CommunityChannelsController } from './community-channels.controller';
import { CommunityChannelsService } from './community-channels.service';

@Module({
  imports: [ChatModule, MediaModule],
  controllers: [CommunityPlacesController, CommunityChannelsController, PlaceMediaController],
  providers: [CommunityPlacesService, CommunityChannelsService, PlaceMediaService],
  // StickersModule: membresía y administración de un social.
  exports: [CommunityChannelsService],
})
export class CommunityModule {}
