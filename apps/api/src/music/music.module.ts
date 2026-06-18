import { Module } from '@nestjs/common';
import { TracksController } from './tracks/tracks.controller';
import { TracksService } from './tracks/tracks.service';
import { TracksExportService } from './tracks/tracks-export.service';
import { PlaylistsController } from './playlists/playlists.controller';
import { PlaylistsService } from './playlists/playlists.service';
import { PlaylistGenerationService } from './playlists/playlist-generation.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

@Module({
  controllers: [TracksController, PlaylistsController, ReportsController],
  providers: [
    TracksService,
    TracksExportService,
    PlaylistsService,
    PlaylistGenerationService,
    ReportsService,
  ],
})
export class MusicModule {}
