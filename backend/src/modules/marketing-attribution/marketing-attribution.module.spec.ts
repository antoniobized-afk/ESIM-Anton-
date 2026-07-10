import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SharedAuthModule } from '@/common/auth/auth.shared-module';
import { PrismaModule } from '@/common/prisma/prisma.module';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingAttributionTelegramService } from './marketing-attribution-telegram.service';
import { MarketingAttributionMiniAppCaptureService } from './marketing-attribution-mini-app-capture.service';
import { MarketingAttributionWebService } from './marketing-attribution-web.service';
import { MarketingAttributionModule } from './marketing-attribution.module';
import { MarketingCampaignsService } from './marketing-campaigns.service';
import { MarketingUserTimelineService } from './marketing-user-timeline.service';
import { ReferralsModule } from '../referrals/referrals.module';

describe('MarketingAttributionModule graph', () => {
  it('компилирует транзитивный Nest module graph без dependency cycle', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        SharedAuthModule,
        MarketingAttributionModule,
      ],
    }).compile();

    await moduleRef.close();
  });

  it('импортирует только referrals owner, не создавая dependency на auth/users/orders', () => {
    const imports = Reflect.getMetadata('imports', MarketingAttributionModule) ?? [];
    const providers = Reflect.getMetadata('providers', MarketingAttributionModule) ?? [];
    const exports = Reflect.getMetadata('exports', MarketingAttributionModule) ?? [];

    expect(imports).toEqual([ReferralsModule]);
    expect(providers).toEqual(
      expect.arrayContaining([
        MarketingCampaignsService,
        MarketingUserTimelineService,
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
