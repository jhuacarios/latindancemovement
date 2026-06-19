import { Module } from '@nestjs/common';
import { TracksController } from './tracks/tracks.controller';
import { TracksService } from './tracks/tracks.service';
import { TracksExportService } from './tracks/tracks-export.service';
import { TracksImportExcelService } from './tracks/tracks-import-excel.service';
import { YoutubeMetadataService } from './tracks/youtube-metadata.service';
import { PlaylistsController } from './playlists/playlists.controller';
import { PlaylistsService } from './playlists/playlists.service';
import { PlaylistGenerationService } from './playlists/playlist-generation.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { LibraryController } from './library/library.controller';
import { LibraryService } from './library/library.service';
import { TagsController } from './tags/tags.controller';
import { TagsService } from './tags/tags.service';

@Module({
  controllers: [
    TracksController,
    PlaylistsController,
    ReportsController,
    LibraryController,
    TagsController,
  ],
  providers: [
    TracksService,
    TracksExportService,
    TracksImportExcelService,
    YoutubeMetadataService,
    PlaylistsService,
    PlaylistGenerationService,
    ReportsService,
    LibraryService,
    TagsService,
  ],
})
export class MusicModule {}
