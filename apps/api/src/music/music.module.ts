import { Module } from '@nestjs/common';
import { TracksController } from './tracks/tracks.controller';
import { TracksService } from './tracks/tracks.service';
import { TracksExportService } from './tracks/tracks-export.service';
import { TracksImportExcelService } from './tracks/tracks-import-excel.service';
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
    TracksImportExcelService,
    PlaylistsService,
    PlaylistGenerationService,
    ReportsService,
  ],
})
export class MusicModule {}
