import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MusicModule } from './music/music.module';
import { AdminModule } from './admin/admin.module';
import { EventsModule } from './events/events.module';
import { CommunityModule } from './community/community.module';
import { ChatModule } from './chat/chat.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MusicModule,
    AdminModule,
    EventsModule,
    CommunityModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
