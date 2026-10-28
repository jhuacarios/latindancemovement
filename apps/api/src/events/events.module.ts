import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { FlyerExtractService } from './flyer-extract.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, FlyerExtractService],
  exports: [EventsService],
})
export class EventsModule {}
