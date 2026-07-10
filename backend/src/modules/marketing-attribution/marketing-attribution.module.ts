import { Module } from '@nestjs/common';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingCampaignsController } from './marketing-campaigns.controller';
import { MarketingCampaignsService } from './marketing-campaigns.service';

@Module({
  controllers: [MarketingCampaignsController],
  providers: [
    MarketingCampaignsService,
    MarketingAttributionLifecycleService,
    MarketingAttributionCaptureService,
  ],
  exports: [
    MarketingCampaignsService,
    MarketingAttributionLifecycleService,
    MarketingAttributionCaptureService,
  ],
})
export class MarketingAttributionModule {}
