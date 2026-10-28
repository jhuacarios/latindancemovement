import { Module } from '@nestjs/common';
import { CommunityPlacesController } from './community-places.controller';
import { CommunityPlacesService } from './community-places.service';

@Module({
  controllers: [CommunityPlacesController],
  providers: [CommunityPlacesService],
})
export class CommunityModule {}
