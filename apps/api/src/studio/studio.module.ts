import { Module } from '@nestjs/common';
import { MusicModule } from '../music/music.module';
import { StudioController } from './studio.controller';
import { StudioService } from './studio.service';
import { StudioAnalysisService } from './studio-analysis.service';
import { StudioQueue } from './studio.queue';
import { AudioStorageService } from './audio-storage.service';
import { AnalyzerClient } from './analyzer.client';
import { StudioEnabledGuard } from './studio-enabled.guard';
import { STUDIO_CONFIG, loadStudioConfig } from './studio.config';

@Module({
  imports: [MusicModule], // TracksService: vincular audios a canciones del catálogo
  controllers: [StudioController],
  providers: [
    // Factory (no valor fijo): se evalúa después de que ConfigModule cargó el .env.
    { provide: STUDIO_CONFIG, useFactory: () => loadStudioConfig() },
    StudioEnabledGuard,
    AudioStorageService,
    AnalyzerClient,
    StudioAnalysisService,
    StudioQueue,
    StudioService,
  ],
})
export class StudioModule {}
