import { randomUUID } from 'node:crypto';
import {
  MarketingTouchChannel,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingAttributionTransaction } from './marketing-attribution.types';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

function assertIsolatedTestDatabase(url: string) {
  const parsed = new URL(url);
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  const databaseName = parsed.pathname.slice(1).toLowerCase();

  if (!isLocalHost || !databaseName.includes('test')) {
    throw new Error(
      'TEST_DATABASE_URL должен указывать на отдельную локальную БД с "test" в имени',
    );
  }
}

function createStateReadBarrier() {
  let reads = 0;
  let release: (() => void) | undefined;
  const bothTransactionsReadState = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    instrument(tx: MarketingAttributionTransaction): MarketingAttributionTransaction {
      const userMarketingAttribution = new Proxy(tx.userMarketingAttribution, {
        get(target, property, receiver) {
          if (property !== 'findUnique') {
            return Reflect.get(target, property, receiver);
          }

          return async (...args: Parameters<typeof target.findUnique>) => {
            const state = await target.findUnique(...args);
            reads += 1;
            if (reads === 2) {
              release?.();
            }
            await bothTransactionsReadState;
            return state;
          };
        },
      });

      return new Proxy(tx, {
        get(target, property, receiver) {
          if (property === 'userMarketingAttribution') {
            return userMarketingAttribution;
          }
          return Reflect.get(target, property, receiver);
        },
      });
    },
  };
}

describeWithDatabase('MarketingAttributionLifecycleService DB', () => {
  const runId = randomUUID();
  const shortCodeSuffix = runId.replaceAll('-', '').slice(0, 12);
  const ids = {
    user: `db-test-user-${runId}`,
    product: `db-test-product-${runId}`,
    order: `db-test-order-${runId}`,
    firstCampaign: `db-test-campaign-first-${runId}`,
    lastCampaign: `db-test-campaign-last-${runId}`,
    laterCampaign: `db-test-campaign-later-${runId}`,
    firstTouch: `db-test-touch-first-${runId}`,
    lastTouch: `db-test-touch-last-${runId}`,
    laterTouch: `db-test-touch-later-${runId}`,
  };
  let setupClient: PrismaClient;
  let firstClient: PrismaClient;
  let secondClient: PrismaClient;

  beforeAll(async () => {
    assertIsolatedTestDatabase(testDatabaseUrl!);
    const clientOptions: Prisma.PrismaClientOptions = {
      datasources: { db: { url: testDatabaseUrl } },
    };
    setupClient = new PrismaClient(clientOptions);
    firstClient = new PrismaClient(clientOptions);
    secondClient = new PrismaClient(clientOptions);
    await Promise.all([
      setupClient.$connect(),
      firstClient.$connect(),
      secondClient.$connect(),
    ]);

    await setupClient.user.create({
      data: {
        id: ids.user,
        email: `db-test-${runId}@example.test`,
        referralCode: `db-test-referral-${runId}`,
      },
    });
    await setupClient.esimProduct.create({
      data: {
        id: ids.product,
        country: 'DB Test',
        name: 'DB Test Product',
        dataAmount: '1 GB',
        validityDays: 1,
        providerPrice: new Prisma.Decimal(1),
        ourPrice: new Prisma.Decimal(2),
        providerId: `db-test-provider-${runId}`,
      },
    });
    await setupClient.order.create({
      data: {
        id: ids.order,
        userId: ids.user,
        productId: ids.product,
        productPrice: new Prisma.Decimal(2),
        totalAmount: new Prisma.Decimal(2),
      },
    });
    await setupClient.marketingCampaign.createMany({
      data: [
        {
          id: ids.firstCampaign,
          shortCode: `first_${shortCodeSuffix}`,
          name: 'First campaign',
          utmSource: 'first-source',
          utmMedium: 'db-test',
          utmCampaign: 'first-campaign',
          targetPath: '/catalog',
        },
        {
          id: ids.lastCampaign,
          shortCode: `last_${shortCodeSuffix}`,
          name: 'Last campaign',
          utmSource: 'last-source',
          utmMedium: 'db-test',
          utmCampaign: 'last-campaign',
          targetPath: '/catalog',
        },
        {
          id: ids.laterCampaign,
          shortCode: `later_${shortCodeSuffix}`,
          name: 'Later campaign',
          utmSource: 'later-source',
          utmMedium: 'db-test',
          utmCampaign: 'later-campaign',
          targetPath: '/catalog',
        },
      ],
    });
    await setupClient.marketingTouch.createMany({
      data: [
        {
          id: ids.firstTouch,
          campaignId: ids.firstCampaign,
          userId: ids.user,
          channel: MarketingTouchChannel.WEB,
          sourceEventKey: `db-test:first:${runId}`,
          occurredAt: new Date('2026-07-09T10:00:00.000Z'),
        },
        {
          id: ids.lastTouch,
          campaignId: ids.lastCampaign,
          userId: ids.user,
          channel: MarketingTouchChannel.TELEGRAM_BOT,
          sourceEventKey: `db-test:last:${runId}`,
          occurredAt: new Date('2026-07-09T11:00:00.000Z'),
        },
        {
          id: ids.laterTouch,
          campaignId: ids.laterCampaign,
          userId: ids.user,
          channel: MarketingTouchChannel.TELEGRAM_MINI_APP,
          sourceEventKey: `db-test:later:${runId}`,
          occurredAt: new Date('2026-07-09T12:00:00.000Z'),
        },
      ],
    });
    await setupClient.userMarketingAttribution.create({
      data: {
        userId: ids.user,
        firstTouchId: ids.firstTouch,
        firstTouchOccurredAt: new Date('2026-07-09T10:00:00.000Z'),
        lastTouchId: ids.lastTouch,
        lastTouchOccurredAt: new Date('2026-07-09T11:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    if (setupClient) {
      await setupClient.orderMarketingAttribution.deleteMany({
        where: { orderId: ids.order },
      });
      await setupClient.order.deleteMany({ where: { id: ids.order } });
      await setupClient.userMarketingAttribution.deleteMany({
        where: { userId: ids.user },
      });
      await setupClient.marketingTouch.deleteMany({
        where: { id: { in: [ids.firstTouch, ids.lastTouch, ids.laterTouch] } },
      });
      await setupClient.marketingCampaign.deleteMany({
        where: {
          id: { in: [ids.firstCampaign, ids.lastCampaign, ids.laterCampaign] },
        },
      });
      await setupClient.esimProduct.deleteMany({ where: { id: ids.product } });
      await setupClient.user.deleteMany({ where: { id: ids.user } });
    }
    await Promise.all([
      setupClient?.$disconnect(),
      firstClient?.$disconnect(),
      secondClient?.$disconnect(),
    ]);
  });

  it('атомарно сохраняет один immutable snapshot при двух независимых transactions', async () => {
    const service = new MarketingAttributionLifecycleService();
    const barrier = createStateReadBarrier();
    const input = { orderId: ids.order, userId: ids.user };

    const [firstResult, secondResult] = await Promise.all([
      firstClient.$transaction((tx) => service.createOrderSnapshot(barrier.instrument(tx), input)),
      secondClient.$transaction((tx) => service.createOrderSnapshot(barrier.instrument(tx), input)),
    ]);

    expect(firstResult.id).toBe(secondResult.id);
    expect(firstResult).toEqual(
      expect.objectContaining({
        orderId: ids.order,
        firstTouchId: ids.firstTouch,
        firstCampaignId: ids.firstCampaign,
        firstCampaignCode: `first_${shortCodeSuffix}`,
        lastTouchId: ids.lastTouch,
        lastCampaignId: ids.lastCampaign,
        lastCampaignCode: `last_${shortCodeSuffix}`,
      }),
    );
    await expect(
      setupClient.orderMarketingAttribution.count({ where: { orderId: ids.order } }),
    ).resolves.toBe(1);

    await setupClient.userMarketingAttribution.update({
      where: { userId: ids.user },
      data: {
        firstTouchId: ids.laterTouch,
        firstTouchOccurredAt: new Date('2026-07-09T12:00:00.000Z'),
        lastTouchId: ids.laterTouch,
        lastTouchOccurredAt: new Date('2026-07-09T12:00:00.000Z'),
      },
    });

    const repeatedResult = await firstClient.$transaction((tx) =>
      service.createOrderSnapshot(tx, input),
    );
    expect(repeatedResult).toEqual(firstResult);
    await expect(
      setupClient.orderMarketingAttribution.findUnique({
        where: { orderId: ids.order },
      }),
    ).resolves.toEqual(firstResult);
  });
});
