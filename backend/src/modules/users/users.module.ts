import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { UserAdminDeletionService } from './user-admin-deletion.service';
import { UserMergePreflightAssetsService } from './user-merge-preflight-assets.service';
import { UserMergePreflightAuditService } from './user-merge-preflight-audit.service';
import { UserMergePreflightService } from './user-merge-preflight.service';

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserAdminDeletionService,
    UserMergePreflightAssetsService,
    UserMergePreflightAuditService,
    UserMergePreflightService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
