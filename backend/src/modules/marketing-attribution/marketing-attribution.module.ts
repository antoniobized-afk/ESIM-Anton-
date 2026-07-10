import { Module } from '@nestjs/common';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingAttributionWebController } from './marketing-attribution-web.controller';
import { MarketingAttributionWebService } from './marketing-attribution-web.service';
import { MarketingCampaignsController } from './marketing-campaigns.controller';
import { MarketingCampaignsService } from './marketing-campaigns.service';

@Module({
  controllers: [MarketingCampaignsController, MarketingAttributionWebController],
  providers: [
    MarketingCampaignsService,
    MarketingAttributionLifecycleService,
    MarketingAttributionCaptureService,
    MarketingAttributionWebService,
  ],
  exports: [
    MarketingCampaignsService,
    MarketingAttributionLifecycleService,
    MarketingAttributionCaptureService,
    MarketingAttributionWebService,
  ],
})
export class MarketingAttributionModule {}
