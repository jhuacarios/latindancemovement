import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { CommunityPlacesController } from './community-places.controller';
import { CommunityPlacesService } from './community-places.service';
import { CommunityChannelsController } from './community-channels.controller';
import { CommunityChannelsService } from './community-channels.service';

@Module({
  imports: [ChatModule],
  controllers: [CommunityPlacesController, CommunityChannelsController],
  providers: [CommunityPlacesService, CommunityChannelsService],
})
export class CommunityModule {}
