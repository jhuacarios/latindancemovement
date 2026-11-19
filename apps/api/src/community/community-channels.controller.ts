import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CommunityChannelsService } from './community-channels.service';
import { CreateChannelDto, UpdateChannelDto } from './dto/community-channel.dto';

/** Comunidad de un lugar: membresía y canales. Los mensajes van por /chat. */
@Controller('community/places/:placeId/community')
@UseGuards(JwtAuthGuard)
export class CommunityChannelsController {
  constructor(private readonly community: CommunityChannelsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string) {
    return this.community.get(user, placeId);
  }

  @Post('join')
  @HttpCode(200)
  join(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string) {
    return this.community.join(user, placeId);
  }

  @Post('leave')
  @HttpCode(200)
  leave(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string) {
    return this.community.leave(user, placeId);
  }

  @Post('channels')
  createChannel(
    @CurrentUser() user: AuthUser,
    @Param('placeId') placeId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.community.createChannel(user, placeId, dto);
  }

  @Patch('channels/:channelId')
  updateChannel(
    @CurrentUser() user: AuthUser,
    @Param('placeId') placeId: string,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.community.updateChannel(user, placeId, channelId, dto);
  }

  @Delete('channels/:channelId')
  deleteChannel(
    @CurrentUser() user: AuthUser,
    @Param('placeId') placeId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.community.deleteChannel(user, placeId, channelId);
  }

  @Post('channels/:channelId/join')
  @HttpCode(200)
  joinChannel(
    @CurrentUser() user: AuthUser,
    @Param('placeId') placeId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.community.joinChannel(user, placeId, channelId);
  }

  @Post('channels/:channelId/leave')
  @HttpCode(200)
  leaveChannel(
    @CurrentUser() user: AuthUser,
    @Param('placeId') placeId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.community.leaveChannel(user, placeId, channelId);
  }
}
