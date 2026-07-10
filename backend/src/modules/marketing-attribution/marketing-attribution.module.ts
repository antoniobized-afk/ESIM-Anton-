import { Module } from '@nestjs/common';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingAttributionWebController } from './marketing-attribution-web.controller';
import { MarketingAttributionWebService } from './marketing-attribution-web.service';
import { MarketingAttributionTelegramController } from './marketing-attribution-telegram.controller';
import { MarketingAttributionTelegramService } from './marketing-attribution-telegram.service';
import { MarketingAttributionMiniAppCaptureService } from './marketing-attribution-mini-app-capture.service';
import { MarketingCampaignsController } from './marketing-campaigns.controller';
import { MarketingCampaignsService } from './marketing-campaigns.service';

@Module({
  controllers: [
    MarketingCampaignsController,
    MarketingAttributionWebController,
    MarketingAttributionTelegramController,
  ],
  providers: [
    MarketingCampaignsService,
    MarketingAttributionLifecycleService,
    MarketingAttributionCaptureService,
    MarketingAttributionWebService,
    MarketingAttributionTelegramService,
    MarketingAttributionMiniAppCaptureService,
  ],
  exports: [
    MarketingCampaignsService,
    MarketingAttributionLifecycleService,
    MarketingAttributionCaptureService,
    MarketingAttributionWebService,
    MarketingAttributionTelegramService,
    MarketingAttributionMiniAppCaptureService,
  ],
})
export class MarketingAttributionModule {}
