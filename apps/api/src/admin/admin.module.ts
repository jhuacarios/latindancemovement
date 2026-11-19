import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PermissionsService } from './permissions.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [AdminController, UsersController, SettingsController, StorageController],
  providers: [PermissionsService, UsersService, SettingsService, StorageService],
})
export class AdminModule {}
