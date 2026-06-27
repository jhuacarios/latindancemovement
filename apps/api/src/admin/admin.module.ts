import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PermissionsService } from './permissions.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [AdminController, UsersController, SettingsController],
  providers: [PermissionsService, UsersService, SettingsService],
})
export class AdminModule {}
