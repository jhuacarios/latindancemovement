import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { GifsModule } from '../gifs/gifs.module';

@Module({
  imports: [GifsModule],
  controllers: [ChatController],
  providers: [ChatService],
  // CommunityModule lo usa para los canales de las comunidades.
  exports: [ChatService],
})
export class ChatModule {}
