import 'reflect-metadata';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingAttributionTelegramService } from './marketing-attribution-telegram.service';
import { MarketingAttributionMiniAppCaptureService } from './marketing-attribution-mini-app-capture.service';
import { MarketingAttributionWebService } from './marketing-attribution-web.service';
import { MarketingAttributionModule } from './marketing-attribution.module';
import { MarketingCampaignsService } from './marketing-campaigns.service';

describe('MarketingAttributionModule graph', () => {
  it('не импортирует auth/users/orders и экспортирует доменных owners', () => {
    const imports = Reflect.getMetadata('imports', MarketingAttributionModule) ?? [];
    const providers = Reflect.getMetadata('providers', MarketingAttributionModule) ?? [];
    const exports = Reflect.getMetadata('exports', MarketingAttributionModule) ?? [];

    expect(imports).toEqual([]);
    expect(providers).toEqual(
      expect.arrayContaining([
        MarketingCampaignsService,
        MarketingAttributionCaptureService,
        MarketingAttributionLifecycleService,
        MarketingAttributionWebService,
        MarketingAttributionTelegramService,
        MarketingAttributionMiniAppCaptureService,
      ]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([
        MarketingCampaignsService,
        MarketingAttributionCaptureService,
        MarketingAttributionLifecycleService,
        MarketingAttributionWebService,
        MarketingAttributionTelegramService,
        MarketingAttributionMiniAppCaptureService,
      ]),
    );
  });
});
