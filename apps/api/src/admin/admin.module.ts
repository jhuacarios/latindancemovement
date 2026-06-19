import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PermissionsService } from './permissions.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [AdminController, UsersController],
  providers: [PermissionsService, UsersService],
})
export class AdminModule {}
