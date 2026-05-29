import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReferralsService } from './referrals.service';
import { PartnerRewardsService } from './partner-rewards.service';
import { ReferralsController } from './referrals.controller';
import { UsersModule } from '../users/users.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [UsersModule, SystemSettingsModule, ConfigModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, PartnerRewardsService],
  exports: [ReferralsService, PartnerRewardsService],
})
export class ReferralsModule {}
