import { Controller, Get, Param, Query } from '@nestjs/common';
import { AcademyShareService } from './academy-share.service';

/**
 * Links compartidos de una clase: SIN sesión (los abre cualquiera que tenga el
 * link). Solo dan fotos y videos de esa clase que estén en la galería.
 */
@Controller('share')
export class ShareController {
  constructor(private readonly share: AcademyShareService) {}

  @Get(':token')
  shared(@Param('token') token: string) {
    return this.share.shared(token);
  }

  @Get(':token/media/:videoId/url')
  viewUrl(@Param('token') token: string, @Param('videoId') videoId: string) {
    return this.share.viewUrl(token, videoId);
  }

  /** `?format=mp4` = la copia compatible (si existe); por defecto, el original. */
  @Get(':token/media/:videoId/download')
  downloadUrl(@Param('token') token: string, @Param('videoId') videoId: string, @Query('format') format?: string) {
    return this.share.downloadUrl(token, videoId, format === 'mp4' ? 'mp4' : 'original');
  }
}
