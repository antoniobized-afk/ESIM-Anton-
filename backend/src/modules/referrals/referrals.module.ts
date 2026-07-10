import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReferralsService } from './referrals.service';
import { ReferralRegistrationService } from './referral-registration.service';
import { PartnerRewardsService } from './partner-rewards.service';
import { ReferralsController } from './referrals.controller';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule, ConfigModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralRegistrationService, PartnerRewardsService],
  exports: [ReferralsService, PartnerRewardsService],
})
export class ReferralsModule {}
