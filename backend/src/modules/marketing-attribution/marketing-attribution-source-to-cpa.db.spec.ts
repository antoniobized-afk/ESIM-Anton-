import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  AuthIdentityProvider,
  CompletionAccountingStatus,
  MarketingTouchChannel,
  OrderStatus,
  Prisma,
  PrismaClient,
  PromoCodeRedemptionSource,
  PromoCodeRedemptionStatus,
  ReferralPayoutMode,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { OrderCompletionAccountingService } from '../orders/order-completion-accounting.service';
import { PartnerRewardsService } from '../referrals/partner-rewards.service';
import { ReferralRegistrationService } from '../referrals/referral-registration.service';
import { ReferralsService } from '../referrals/referrals.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { MarketingAttributionReportExportService } from './marketing-attribution-report-export.service';
import { MarketingAttributionReportService } from './marketing-attribution-report.service';
import { MarketingAttributionTelegramService } from './marketing-attribution-telegram.service';
import { MarketingAttributionWebService } from './marketing-attribution-web.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('Marketing attribution source-to-CPA DB', () => {
  const runId = randomUUID();
  const keyMaterial = runId.replaceAll('-', '');
  const shortCode = keyMaterial.slice(0, 12);
  const telegramSubject = `9${runId.replace(/\D/g, '').padEnd(17, '0').slice(0, 17)}`;
  const ids = {
    partner: `step8-partner-${runId}`,
    promoOwner: `step8-promo-owner-${runId}`,
    customer: `step8-customer-${runId}`,
    telegramIdentity: `step8-telegram-identity-${runId}`,
    product: `step8-product-${runId}`,
    referralLink: `step8-referral-${runId}`,
    campaign: `step8-campaign-${runId}`,
    manualPromo: `step8-promo-${runId}`,
    manualRedemption: `step8-redemption-${runId}`,
    primaryOrder: `step8-primary-order-${runId}`,
    manualPromoOrder: `step8-manual-promo-order-${runId}`,
    topUpOrder: `step8-topup-order-${runId}`,
  };
  const visitorToken = `step8visitor${keyMaterial}`;
  const launchKey = `step8launch${keyMaterial}`;
  let client: PrismaClient;
  let web: MarketingAttributionWebService;
  let telegram: MarketingAttributionTelegramService;
  let lifecycle: MarketingAttributionLifecycleService;
  let accounting: OrderCompletionAccountingService;
  let reports: MarketingAttributionReportService;
  let exporter: MarketingAttributionReportExportService;

  beforeAll(async () => {
    client = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    await client.$connect();

    const prisma = client as unknown as PrismaService;
    const config = new ConfigService({
      MARKETING_ATTRIBUTION_VISITOR_HMAC_SECRET: `step8-secret-${keyMaterial}`,
    });
    const settings = new SystemSettingsService(prisma);
    const rewards = new PartnerRewardsService(prisma, settings);
    const referralRegistration = new ReferralRegistrationService(prisma);
    const referrals = new ReferralsService(
      prisma,
      settings,
      config,
      rewards,
      referralRegistration,
    );
    lifecycle = new MarketingAttributionLifecycleService();
    const capture = new MarketingAttributionCaptureService(prisma, lifecycle);
    web = new MarketingAttributionWebService(prisma, capture, lifecycle, referrals, config);
    telegram = new MarketingAttributionTelegramService(
      prisma,
      capture,
      lifecycle,
      referrals,
    );
    accounting = new OrderCompletionAccountingService(
      prisma,
      settings,
      referrals,
      rewards,
      {
        getEffectiveLevelForSpent: jest.fn().mockResolvedValue(null),
        updateUserLevel: jest.fn().mockResolvedValue(undefined),
      } as unknown as LoyaltyService,
      config,
    );
    reports = new MarketingAttributionReportService(prisma);
    exporter = new MarketingAttributionReportExportService(reports);

    await client.user.createMany({
      data: [
        {
          id: ids.partner,
          email: `step8-partner-${runId}@example.test`,
          referralCode: `step8-partner-${runId}`,
          firstName: 'Step 08',
          lastName: 'Partner',
        },
        {
          id: ids.promoOwner,
          email: `step8-promo-owner-${runId}@example.test`,
          referralCode: `step8-promo-owner-${runId}`,
          firstName: 'Step 08',
          lastName: 'Promo owner',
        },
      ],
    });
    await client.referralLink.create({
      data: {
        id: ids.referralLink,
        code: `STEP8LINK${keyMaterial.slice(0, 10)}`,
        label: 'Step 08 source-to-CPA',
        userId: ids.partner,
        bonusPercent: new Prisma.Decimal(10),
        payoutMode: ReferralPayoutMode.BALANCE,
      },
    });
    await client.marketingCampaign.create({
      data: {
        id: ids.campaign,
        shortCode,
        name: 'Step 08 source-to-CPA',
        utmSource: 'step8-db',
        utmMedium: 'integration',
        utmCampaign: 'source-to-cpa',
        targetPath: '/',
        referralLinkId: ids.referralLink,
      },
    });
    await client.promoCode.create({
      data: {
        id: ids.manualPromo,
        code: `STEP8PROMO${keyMaterial.slice(0, 10)}`,
        discountPercent: 5,
        referralOwnerId: ids.promoOwner,
        referralBonusPercent: new Prisma.Decimal('12.5'),
        referralPayoutMode: ReferralPayoutMode.EXTERNAL,
      },
    });
    await client.esimProduct.create({
      data: {
        id: ids.product,
        country: 'DB Test',
        name: 'Step 08 Product',
        dataAmount: '1 GB',
        validityDays: 1,
        providerPrice: new Prisma.Decimal(500),
        ourPrice: new Prisma.Decimal(1000),
        providerId: `step8-provider-${runId}`,
      },
    });
    await client.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: ids.customer,
          email: `step8-customer-${runId}@example.test`,
          referralCode: `step8-customer-${runId}`,
        },
      });
      await tx.userIdentity.create({
        data: {
          id: ids.telegramIdentity,
          userId: ids.customer,
          provider: AuthIdentityProvider.TELEGRAM,
          providerSubject: telegramSubject,
        },
      });
      await lifecycle.initializeRegistrationAttributionForNewUser(tx, ids.customer);
    });
  });

  afterAll(async () => {
    if (!client) return;

    const orderIds = [ids.primaryOrder, ids.manualPromoOrder, ids.topUpOrder];
    await client.transaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await client.promoCodeRedemption.deleteMany({ where: { id: ids.manualRedemption } });
    await client.orderMarketingAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
    await client.order.deleteMany({ where: { id: ids.topUpOrder } });
    await client.order.deleteMany({ where: { id: { in: [ids.primaryOrder, ids.manualPromoOrder] } } });
    await client.userMarketingAttribution.deleteMany({ where: { userId: ids.customer } });
    await client.marketingTouch.deleteMany({ where: { campaignId: ids.campaign } });
    await client.marketingCampaign.deleteMany({ where: { id: ids.campaign } });
    await client.userIdentity.deleteMany({ where: { id: ids.telegramIdentity } });
    await client.user.deleteMany({ where: { id: ids.customer } });
    await client.referralLink.deleteMany({ where: { id: ids.referralLink } });
    await client.promoCode.deleteMany({ where: { id: ids.manualPromo } });
    await client.esimProduct.deleteMany({ where: { id: ids.product } });
    await client.user.deleteMany({ where: { id: { in: [ids.partner, ids.promoOwner] } } });
    await client.$disconnect();
  });

  it('проводит linked campaign через claim, accounting, promo precedence, reports и XLSX', async () => {
    await expect(
      web.captureWebTouch({ campaignCode: shortCode, visitorToken, launchKey }),
    ).resolves.toEqual({ accepted: true, targetPath: '/' });
    await expect(
      web.claimWebTouches(ids.customer, { visitorToken }),
    ).resolves.toEqual({ claimedTouches: 1, registrationFinalized: true });

    await expect(
      client.user.findUnique({
        where: { id: ids.customer },
        select: { referredById: true, referralLinkId: true, telegramId: true },
      }),
    ).resolves.toEqual({
      referredById: ids.partner,
      referralLinkId: ids.referralLink,
      telegramId: null,
    });
    await expect(
      telegram.captureBotTouch({
        userId: ids.customer,
        telegramId: telegramSubject,
        startParam: `ma_${shortCode}`,
        sourceEventKey: `telegram-bot:step8:${keyMaterial}`,
      }),
    ).resolves.toEqual({ accepted: true, registrationFinalized: false });

    const currentAttribution = await client.userMarketingAttribution.findUnique({
      where: { userId: ids.customer },
      select: {
        registrationFirstChannel: true,
        registrationLastChannel: true,
        firstTouch: { select: { channel: true } },
        lastTouch: { select: { channel: true } },
      },
    });
    expect(currentAttribution).toEqual({
      registrationFirstChannel: MarketingTouchChannel.WEB,
      registrationLastChannel: MarketingTouchChannel.WEB,
      firstTouch: { channel: MarketingTouchChannel.WEB },
      lastTouch: { channel: MarketingTouchChannel.TELEGRAM_BOT },
    });

    const completedAt = new Date();
    const primarySnapshot = await client.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id: ids.primaryOrder,
          userId: ids.customer,
          productId: ids.product,
          status: OrderStatus.COMPLETED,
          completionAccountingStatus: CompletionAccountingStatus.PENDING,
          productPrice: new Prisma.Decimal(1000),
          totalAmount: new Prisma.Decimal(1000),
          completedAt,
        },
      });
      return lifecycle.createOrderSnapshot(tx, {
        orderId: ids.primaryOrder,
        userId: ids.customer,
      });
    });
    expect(primarySnapshot).toEqual(
      expect.objectContaining({
        firstCampaignId: ids.campaign,
        firstChannel: MarketingTouchChannel.WEB,
        lastCampaignId: ids.campaign,
        lastChannel: MarketingTouchChannel.TELEGRAM_BOT,
      }),
    );

    const manualPromoSnapshot = await client.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id: ids.manualPromoOrder,
          userId: ids.customer,
          productId: ids.product,
          status: OrderStatus.COMPLETED,
          completionAccountingStatus: CompletionAccountingStatus.PENDING,
          productPrice: new Prisma.Decimal(1000),
          totalAmount: new Prisma.Decimal(1000),
          promoCode: `STEP8PROMO${keyMaterial.slice(0, 10)}`,
          completedAt,
        },
      });
      const snapshot = await lifecycle.createOrderSnapshot(tx, {
        orderId: ids.manualPromoOrder,
        userId: ids.customer,
      });
      await tx.promoCodeRedemption.create({
        data: {
          id: ids.manualRedemption,
          promoCodeId: ids.manualPromo,
          userId: ids.customer,
          orderId: ids.manualPromoOrder,
          source: PromoCodeRedemptionSource.MANUAL,
          status: PromoCodeRedemptionStatus.CONSUMED,
          rewardOwnerIdSnapshot: ids.promoOwner,
          rewardBonusPercentSnapshot: new Prisma.Decimal('12.5'),
          rewardPayoutModeSnapshot: ReferralPayoutMode.EXTERNAL,
          consumedAt: completedAt,
        },
      });
      return snapshot;
    });
    expect(manualPromoSnapshot).toEqual(
      expect.objectContaining({
        firstChannel: MarketingTouchChannel.WEB,
        lastChannel: MarketingTouchChannel.TELEGRAM_BOT,
      }),
    );

    const topUpSnapshot = await client.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id: ids.topUpOrder,
          userId: ids.customer,
          productId: ids.product,
          parentOrderId: ids.primaryOrder,
          status: OrderStatus.COMPLETED,
          completionAccountingStatus: CompletionAccountingStatus.PENDING,
          productPrice: new Prisma.Decimal(100),
          totalAmount: new Prisma.Decimal(100),
          completedAt,
        },
      });
      return lifecycle.createOrderSnapshot(tx, {
        orderId: ids.topUpOrder,
        userId: ids.customer,
      });
    });
    expect(topUpSnapshot).toBeNull();

    await expect(
      accounting.attemptPurchaseAccounting(ids.primaryOrder, { force: true }),
    ).resolves.toEqual({
      orderId: ids.primaryOrder,
      status: CompletionAccountingStatus.APPLIED,
      applied: true,
      reason: 'applied',
    });
    await expect(
      accounting.attemptPurchaseAccounting(ids.primaryOrder, { force: true }),
    ).resolves.toEqual({
      orderId: ids.primaryOrder,
      status: CompletionAccountingStatus.APPLIED,
      applied: false,
      reason: 'already_applied',
    });
    await expect(
      accounting.attemptPurchaseAccounting(ids.manualPromoOrder, { force: true }),
    ).resolves.toEqual({
      orderId: ids.manualPromoOrder,
      status: CompletionAccountingStatus.APPLIED,
      applied: true,
      reason: 'applied',
    });
    await expect(
      accounting.attemptPurchaseAccounting(ids.topUpOrder, { force: true }),
    ).resolves.toEqual({
      orderId: ids.topUpOrder,
      status: CompletionAccountingStatus.NOT_REQUIRED,
      applied: false,
      reason: 'not_required',
    });

    const rewardLedger = await client.transaction.findMany({
      where: {
        orderId: { in: [ids.primaryOrder, ids.manualPromoOrder, ids.topUpOrder] },
        type: TransactionType.REFERRAL_BONUS,
        status: TransactionStatus.SUCCEEDED,
      },
      orderBy: { orderId: 'asc' },
      select: {
        orderId: true,
        referralLinkId: true,
        promoCodeId: true,
        amount: true,
      },
    });
    expect(rewardLedger).toEqual(
      expect.arrayContaining([
        {
          orderId: ids.primaryOrder,
          referralLinkId: ids.referralLink,
          promoCodeId: null,
          amount: new Prisma.Decimal(100),
        },
        {
          orderId: ids.manualPromoOrder,
          referralLinkId: null,
          promoCodeId: ids.manualPromo,
          amount: new Prisma.Decimal(125),
        },
      ]),
    );
    expect(rewardLedger).toHaveLength(2);

    const dateFrom = new Date(completedAt.getTime() - 86_400_000).toISOString().slice(0, 10);
    const dateTo = new Date(completedAt.getTime() + 86_400_000).toISOString().slice(0, 10);
    const firstWeb = await reports.getAttributionReport({
      dateFrom,
      dateTo,
      model: 'FIRST_TOUCH',
      channel: MarketingTouchChannel.WEB,
    });
    const lastBot = await reports.getAttributionReport({
      dateFrom,
      dateTo,
      model: 'LAST_TOUCH',
      channel: MarketingTouchChannel.TELEGRAM_BOT,
    });
    const lastWeb = await reports.getAttributionReport({
      dateFrom,
      dateTo,
      model: 'LAST_TOUCH',
      channel: MarketingTouchChannel.WEB,
    });
    expect(firstWeb.rows.find((row) => row.campaign?.id === ids.campaign)?.metrics).toEqual(
      expect.objectContaining({ registrations: 1, purchases: 2, revenue: new Prisma.Decimal(2000) }),
    );
    expect(lastBot.rows.find((row) => row.campaign?.id === ids.campaign)?.metrics).toEqual(
      expect.objectContaining({ registrations: 0, purchases: 2, revenue: new Prisma.Decimal(2000) }),
    );
    expect(lastWeb.rows.find((row) => row.campaign?.id === ids.campaign)?.metrics).toEqual(
      expect.objectContaining({ registrations: 1, purchases: 0, revenue: new Prisma.Decimal(0) }),
    );

    const cpa = await reports.getCpaReport({
      dateFrom,
      dateTo,
      model: 'LAST_TOUCH',
      channel: MarketingTouchChannel.TELEGRAM_BOT,
    });
    expect(cpa.rows.find((row) => row.campaign.id === ids.campaign)?.metrics).toEqual(
      expect.objectContaining({
        firstPurchases: 1,
        repeatPurchases: 1,
        purchases: 2,
        revenue: new Prisma.Decimal(2000),
        rewardsCount: 1,
        payout: new Prisma.Decimal(100),
        actualCpa: new Prisma.Decimal(100),
      }),
    );

    const file = await exporter.buildExcelFile({
      dateFrom,
      dateTo,
      model: 'LAST_TOUCH',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const attributionSheet = workbook.getWorksheet('Атрибуция')!;
    const cpaSheet = workbook.getWorksheet('Блогеры и CPA')!;
    expect(file.filename).toBe(
      `marketing_attribution_${dateFrom}_${dateTo}_last_touch.xlsx`,
    );
    expect(attributionSheet.getRow(2).getCell(15).value).toBe(2);
    expect(attributionSheet.getRow(2).getCell(16).value).toBe(2000);
    expect(cpaSheet.getRow(2).getCell(12).value).toBe(2);
    expect(cpaSheet.getRow(2).getCell(13).value).toBe(2000);
    expect(cpaSheet.getRow(2).getCell(14).value).toBe(1);
    expect(cpaSheet.getRow(2).getCell(15).value).toBe(100);
    expect(cpaSheet.getRow(2).getCell(16).value).toBe(100);
    expect(cpaSheet.getRow(2).getCell(17).value).toBe(100);
    expect(cpaSheet.getRow(2).getCell(18).value).toBe(0);
  });
});
