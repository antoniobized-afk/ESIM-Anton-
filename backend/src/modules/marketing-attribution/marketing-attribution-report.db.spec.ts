import { randomUUID } from 'node:crypto';
import {
  AuthIdentityProvider,
  MarketingRegistrationAttributionStatus,
  MarketingTouchChannel,
  OrderStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MarketingAttributionReportService } from './marketing-attribution-report.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('MarketingAttributionReportService DB', () => {
  const runId = randomUUID();
  const shortCodeSuffix = runId.replaceAll('-', '').slice(0, 12);
  const providerSubject = `9${runId.replace(/\D/g, '').padEnd(17, '0').slice(0, 17)}`;
  const occurredAt = new Date('2026-07-10T10:00:00.000Z');
  const registrationFinalizedAt = new Date('2026-07-10T10:01:00.000Z');
  const completedAt = new Date('2026-07-10T10:02:00.000Z');
  const ids = {
    user: `db-report-user-${runId}`,
    identity: `db-report-identity-${runId}`,
    campaign: `db-report-campaign-${runId}`,
    touch: `db-report-touch-${runId}`,
    product: `db-report-product-${runId}`,
    order: `db-report-order-${runId}`,
  };
  const campaign = {
    shortCode: `report_${shortCodeSuffix}`,
    name: `DB Telegram report ${shortCodeSuffix}`,
    utmSource: 'telegram-db-test',
    utmMedium: 'bot',
    utmCampaign: 'nullable-contact',
  };
  let client: PrismaClient;
  let service: MarketingAttributionReportService;

  beforeAll(async () => {
    const clientOptions: Prisma.PrismaClientOptions = {
      datasources: { db: { url: testDatabaseUrl } },
    };
    client = new PrismaClient(clientOptions);
    await client.$connect();
    service = new MarketingAttributionReportService(
      client as unknown as PrismaService,
    );

    await client.user.create({
      data: {
        id: ids.user,
        telegramId: null,
        email: `db-report-${runId}@example.test`,
        referralCode: `db-report-referral-${runId}`,
      },
    });
    await client.userIdentity.create({
      data: {
        id: ids.identity,
        userId: ids.user,
        provider: AuthIdentityProvider.TELEGRAM,
        providerSubject,
      },
    });
    await client.esimProduct.create({
      data: {
        id: ids.product,
        country: 'DB Report',
        name: 'DB Report Product',
        dataAmount: '1 GB',
        validityDays: 1,
        providerPrice: new Prisma.Decimal(10),
        ourPrice: new Prisma.Decimal(19),
        providerId: `db-report-provider-${runId}`,
      },
    });
    await client.marketingCampaign.create({
      data: {
        id: ids.campaign,
        ...campaign,
        targetPath: '/catalog',
      },
    });
    await client.marketingTouch.create({
      data: {
        id: ids.touch,
        campaignId: ids.campaign,
        userId: ids.user,
        channel: MarketingTouchChannel.TELEGRAM_BOT,
        sourceEventKey: `db-report:telegram:${runId}`,
        occurredAt,
      },
    });
    await client.userMarketingAttribution.create({
      data: {
        userId: ids.user,
        firstTouchId: ids.touch,
        firstTouchOccurredAt: occurredAt,
        lastTouchId: ids.touch,
        lastTouchOccurredAt: occurredAt,
        registrationStatus: MarketingRegistrationAttributionStatus.ATTRIBUTED,
        registrationEligibleAt: occurredAt,
        registrationFinalizedAt,
        registrationFirstTouchId: ids.touch,
        registrationLastTouchId: ids.touch,
        registrationFirstCampaignId: ids.campaign,
        registrationFirstCampaignCode: campaign.shortCode,
        registrationFirstCampaignName: campaign.name,
        registrationFirstUtmSource: campaign.utmSource,
        registrationFirstUtmMedium: campaign.utmMedium,
        registrationFirstUtmCampaign: campaign.utmCampaign,
        registrationFirstChannel: MarketingTouchChannel.TELEGRAM_BOT,
        registrationFirstOccurredAt: occurredAt,
        registrationLastCampaignId: ids.campaign,
        registrationLastCampaignCode: campaign.shortCode,
        registrationLastCampaignName: campaign.name,
        registrationLastUtmSource: campaign.utmSource,
        registrationLastUtmMedium: campaign.utmMedium,
        registrationLastUtmCampaign: campaign.utmCampaign,
        registrationLastChannel: MarketingTouchChannel.TELEGRAM_BOT,
        registrationLastOccurredAt: occurredAt,
      },
    });
    await client.order.create({
      data: {
        id: ids.order,
        userId: ids.user,
        productId: ids.product,
        status: OrderStatus.COMPLETED,
        productPrice: new Prisma.Decimal(19),
        totalAmount: new Prisma.Decimal(19),
        completedAt,
      },
    });
    await client.orderMarketingAttribution.create({
      data: {
        orderId: ids.order,
        firstTouchId: ids.touch,
        lastTouchId: ids.touch,
        firstCampaignId: ids.campaign,
        lastCampaignId: ids.campaign,
        firstChannel: MarketingTouchChannel.TELEGRAM_BOT,
        lastChannel: MarketingTouchChannel.TELEGRAM_BOT,
      },
    });
  });

  afterAll(async () => {
    if (client) {
      await client.orderMarketingAttribution.deleteMany({ where: { orderId: ids.order } });
      await client.order.deleteMany({ where: { id: ids.order } });
      await client.userMarketingAttribution.deleteMany({
        where: { userId: ids.user },
      });
      await client.marketingTouch.deleteMany({ where: { id: ids.touch } });
      await client.marketingCampaign.deleteMany({ where: { id: ids.campaign } });
      await client.userIdentity.deleteMany({ where: { id: ids.identity } });
      await client.user.deleteMany({ where: { id: ids.user } });
      await client.esimProduct.deleteMany({ where: { id: ids.product } });
      await client.$disconnect();
    }
  });

  it('возвращает те же Telegram facts независимо от nullable legacy contact', async () => {
    const readFixtureFacts = async () => {
      const report = await service.getAttributionReport({
        dateFrom: '2026-07-10',
        dateTo: '2026-07-10',
        channel: MarketingTouchChannel.TELEGRAM_BOT,
        model: 'LAST_TOUCH',
      });
      const row = report.rows.find((candidate) => candidate.campaign?.id === ids.campaign);

      if (!row) {
        throw new Error('DB fixture campaign отсутствует в attribution report');
      }

      return {
        clicks: row.metrics.clicks,
        registrations: row.metrics.registrations,
        firstPurchases: row.metrics.firstPurchases,
        repeatPurchases: row.metrics.repeatPurchases,
        revenue: row.metrics.revenue.toString(),
      };
    };

    await expect(
      client.user.findUnique({
        where: { id: ids.user },
        select: { telegramId: true },
      }),
    ).resolves.toEqual({ telegramId: null });
    await expect(
      client.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthIdentityProvider.TELEGRAM,
            providerSubject,
          },
        },
        select: { userId: true },
      }),
    ).resolves.toEqual({ userId: ids.user });

    const factsWithNullContact = await readFixtureFacts();
    expect(factsWithNullContact).toEqual({
      clicks: 1,
      registrations: 1,
      firstPurchases: 1,
      repeatPurchases: 0,
      revenue: '19',
    });

    await client.user.update({
      where: { id: ids.user },
      data: { telegramId: BigInt(providerSubject) },
    });

    await expect(readFixtureFacts()).resolves.toEqual(factsWithNullContact);
  });

  it('исполняет paginated order drill-down и сохраняет total за последней страницей', async () => {
    const query = {
      dateFrom: '2026-07-10',
      dateTo: '2026-07-10',
      channel: MarketingTouchChannel.TELEGRAM_BOT,
      model: 'FIRST_TOUCH' as const,
      source: 'CAMPAIGN' as const,
      campaignId: ids.campaign,
      limit: 1,
    };

    const firstPage = await service.getAttributionOrderDetails({ ...query, page: 1 });
    expect(firstPage).toEqual(expect.objectContaining({
      meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
      data: [expect.objectContaining({
        id: ids.order,
        purchaseSequence: 1,
        purchaseKind: 'FIRST',
        totalAmount: new Prisma.Decimal(19),
        product: { name: 'DB Report Product', country: 'DB Report' },
      })],
    }));

    await expect(service.getAttributionOrderDetails({ ...query, page: 2 }))
      .resolves.toEqual(expect.objectContaining({
        data: [],
        meta: { page: 2, limit: 1, total: 1, totalPages: 1 },
      }));

    await expect(service.getAttributionOrderDetails({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      model: query.model,
      source: 'DIRECT',
    })).resolves.toEqual(expect.objectContaining({
      data: [],
      meta: { page: 1, limit: 50, total: 0, totalPages: 1 },
    }));
  });
});
