import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { UserMergePreflightAssetsService } from './user-merge-preflight-assets.service';
import { UserMergePreflightAuditService } from './user-merge-preflight-audit.service';
import { UserMergePreflightService } from './user-merge-preflight.service';

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserMergePreflightAssetsService,
    UserMergePreflightAuditService,
    UserMergePreflightService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
