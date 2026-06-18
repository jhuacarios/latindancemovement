import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PermissionsService } from './permissions.service';

@Module({
  controllers: [AdminController],
  providers: [PermissionsService],
})
export class AdminModule {}
