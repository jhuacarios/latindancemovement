import { Controller, Get, Param } from '@nestjs/common';
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

  @Get(':token/media/:videoId/download')
  downloadUrl(@Param('token') token: string, @Param('videoId') videoId: string) {
    return this.share.downloadUrl(token, videoId);
  }
}
