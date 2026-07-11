import { BadRequestException } from '@nestjs/common';
import { MarketingTouchChannel, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MarketingAttributionReportService } from './marketing-attribution-report.service';

const filters = {
  dateFrom: '2026-07-01',
  dateTo: '2026-07-10',
  model: 'FIRST_TOUCH' as const,
};

const attributionRow = {
  campaignId: 'campaign_1',
  shortCode: 'AbCdEfGh1234',
  name: 'Summer launch',
  utmSource: 'blogger',
  utmMedium: 'social',
  utmCampaign: 'summer-2026',
  isActive: false,
  deactivatedAt: new Date('2026-07-09T10:00:00.000Z'),
  clicks: 12n,
  registrations: 4n,
  firstPurchases: 1n,
  repeatPurchases: 2n,
  revenue: new Prisma.Decimal('1299.90'),
};

const cpaRow = {
  campaignId: 'campaign_1',
  shortCode: 'AbCdEfGh1234',
  name: 'Summer launch',
  isActive: false,
  deactivatedAt: new Date('2026-07-09T10:00:00.000Z'),
  referralLinkId: 'referral_1',
  referralCode: 'blogger-code',
  referralLabel: 'Travel blogger',
  partnerUserId: 'partner_1',
  partnerFirstName: 'Анна',
  partnerLastName: null,
  partnerUsername: 'travel_anna',
  partnerReferralCode: 'partner-code',
  firstPurchases: 1n,
  repeatPurchases: 1n,
  revenue: new Prisma.Decimal('1000.00'),
  payoutMode: 'EXTERNAL' as const,
  rewardsCount: 1n,
  payout: new Prisma.Decimal('30.00'),
};

const orderDetailsRow = {
  orderId: 'order_1',
  userId: 'user_1',
  userFirstName: 'Анна',
  userLastName: null,
  userUsername: 'anna',
  userEmail: 'anna@example.test',
  productName: 'Europe 5 GB',
  productCountry: 'EU',
  completedAt: new Date('2026-07-10T12:00:00.000Z'),
  totalAmount: new Prisma.Decimal('19.00'),
  purchaseSequence: 2n,
  totalCount: 2n,
};

const emptyOrderDetailsRow = {
  orderId: null,
  userId: null,
  userFirstName: null,
  userLastName: null,
  userUsername: null,
  userEmail: null,
  productName: null,
  productCountry: null,
  completedAt: null,
  totalAmount: null,
  purchaseSequence: null,
  totalCount: 0n,
};

function makeService() {
  const prisma = { $queryRaw: jest.fn() };
  return {
    prisma,
    service: new MarketingAttributionReportService(prisma as unknown as PrismaService),
  };
}

function queryText(call: unknown[]) {
  const query = call[0] as { strings: readonly string[] };
  return query.strings.join('?');
}

describe('MarketingAttributionReportService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('переключает только immutable first snapshot dimensions и сохраняет deactivated history', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValue([attributionRow]);

    const result = await service.getAttributionReport(filters);
    const sql = queryText(prisma.$queryRaw.mock.calls[0]);

    expect(sql).toContain('uma."registrationFirstCampaignId"');
    expect(sql).toContain('oma."firstCampaignId"');
    expect(sql).not.toContain('registrationLastCampaignId');
    expect(sql).toContain('mt."campaignId" AS "campaignId"');
    expect(sql).toContain('facts."campaignId" ASC');
    expect(sql).not.toContain('"productId"');
    expect(result.rows[0]).toEqual(expect.objectContaining({
      campaign: expect.objectContaining({ id: 'campaign_1', isActive: false }),
      metrics: expect.objectContaining({
        clicks: 12,
        registrations: 4,
        firstPurchases: 1,
        repeatPurchases: 2,
        purchases: 3,
      }),
    }));
    expect(result.totals.revenue.toString()).toBe('1299.9');
  });

  it('не добавляет users и legacy identity joins в attribution SQL', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValue([attributionRow]);

    await service.getAttributionReport({
      ...filters,
      channel: MarketingTouchChannel.TELEGRAM_BOT,
    });
    const sql = queryText(prisma.$queryRaw.mock.calls[0]);

    expect(sql).not.toMatch(/JOIN users|user_identities/);
    expect(sql).not.toMatch(/telegramId|authProvider|providerId/);
  });

  it('строит CPA только по successful matching ledger и snapshot payout mode', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        ...cpaRow,
        payoutMode: 'BALANCE',
        payout: new Prisma.Decimal('20.00'),
      },
      cpaRow,
    ]);

    const result = await service.getCpaReport(filters);
    const cpaSql = queryText(prisma.$queryRaw.mock.calls[0]);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(cpaSql).not.toContain('reward_totals');
    expect(cpaSql).toContain('payout_splits AS');
    expect(cpaSql).toContain('t."orderId" = so."orderId"');
    expect(cpaSql).toContain('t."referralLinkId" = mc."referralLinkId"');
    expect(cpaSql).toContain("t.type = 'REFERRAL_BONUS'");
    expect(cpaSql).toContain("t.status = 'SUCCEEDED'");
    expect(cpaSql).toContain("t.metadata->>'payoutMode'");
    expect(cpaSql).toContain('ORDER BY mc.name ASC, mc.id ASC, ps."payoutMode" ASC');
    expect(cpaSql).not.toMatch(/bonusPercent|referralBonusPercent/);
    expect(cpaSql).not.toContain('"productId"');
    expect(result.rows[0].metrics.actualCpa?.toString()).toBe('25');
    expect(result.rows[0].metrics.rewardsCount).toBe(2);
    expect(result.rows[0].payoutModeSplit).toEqual([
      expect.objectContaining({ payoutMode: 'BALANCE', rewardsCount: 1 }),
      expect.objectContaining({ payoutMode: 'EXTERNAL', rewardsCount: 1 }),
    ]);
    expect(result.totals.payout.toString()).toBe('50');
  });

  it('стабилизирует CPA rows по campaign id при равных payout и name', async () => {
    const { prisma, service } = makeService();
    const laterCampaign = {
      ...cpaRow,
      campaignId: 'campaign_2',
      referralLinkId: 'referral_2',
      referralCode: 'blogger-code-2',
    };
    prisma.$queryRaw.mockResolvedValueOnce([
      { ...laterCampaign, payout: new Prisma.Decimal('10.00') },
      { ...cpaRow, payout: new Prisma.Decimal('10.00') },
    ]);

    const result = await service.getCpaReport(filters);

    expect(result.rows.map((row) => row.campaign.id)).toEqual(['campaign_1', 'campaign_2']);
  });

  it('сохраняет linked campaign без ledger как строку с нулевым payout', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([{
      ...cpaRow,
      payoutMode: null,
      rewardsCount: 0n,
      payout: new Prisma.Decimal(0),
    }]);

    const result = await service.getCpaReport(filters);

    expect(result.rows[0].metrics).toEqual(expect.objectContaining({
      rewardsCount: 0,
      payout: new Prisma.Decimal(0),
      actualCpa: null,
    }));
    expect(result.rows[0].payoutModeSplit).toEqual([]);
  });

  it('возвращает concrete primary orders из campaign-строки с теми же first/last filters', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([orderDetailsRow]);

    const result = await service.getAttributionOrderDetails({
      ...filters,
      source: 'CAMPAIGN',
      campaignId: 'campaign_1',
      page: 1,
      limit: 50,
    });
    const sql = queryText(prisma.$queryRaw.mock.calls[0]);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sql).toContain('oma."firstCampaignId"');
    expect(sql).not.toContain('o."productId"');
    expect(sql).toContain('matching_count AS');
    expect(sql).toContain('page_orders AS');
    expect(sql).toContain('LEFT JOIN users user_record');
    expect(sql).toContain('LEFT JOIN orders order_record');
    expect(sql).toContain('LEFT JOIN esim_products product');
    expect(sql).not.toContain('ranked_primary_orders AS');
    expect(sql).toContain('page_user_sequences AS');
    expect(sql).toContain('SELECT DISTINCT "userId"');
    expect(sql).toContain('history."completedAt", history.id');
    expect(sql).toContain('COUNT(*)::bigint AS "totalCount"');
    expect(sql.indexOf('LIMIT ?')).toBeLessThan(sql.indexOf('LEFT JOIN users user_record'));
    expect(result).toEqual(expect.objectContaining({
      source: 'CAMPAIGN',
      campaignId: 'campaign_1',
      meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
      data: [expect.objectContaining({
        id: 'order_1',
        purchaseSequence: 2,
        purchaseKind: 'REPEAT',
        totalAmount: new Prisma.Decimal('19.00'),
      })],
    }));
  });

  it('читает direct drill-down только по snapshot без campaign', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([emptyOrderDetailsRow]);

    const result = await service.getAttributionOrderDetails({
      ...filters,
      source: 'DIRECT',
    });
    const sql = queryText(prisma.$queryRaw.mock.calls[0]);

    expect(sql).toContain('oma."firstCampaignId" IS NULL');
    expect(result).toEqual(expect.objectContaining({
      source: 'DIRECT',
      campaignId: null,
      data: [],
      meta: { page: 1, limit: 50, total: 0, totalPages: 1 },
    }));
  });

  it('сохраняет authoritative total для пустой страницы за пределами результата', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([{
      ...emptyOrderDetailsRow,
      totalCount: 51n,
    }]);

    const result = await service.getAttributionOrderDetails({
      ...filters,
      source: 'CAMPAIGN',
      campaignId: 'campaign_1',
      page: 3,
      limit: 25,
    });

    expect(result).toEqual(expect.objectContaining({
      data: [],
      meta: { page: 3, limit: 25, total: 51, totalPages: 3 },
    }));
  });

  it('не допускает смешивать campaign и direct source при детализации заказов', async () => {
    const { service } = makeService();

    await expect(service.getAttributionOrderDetails({
      ...filters,
      source: 'CAMPAIGN',
    })).rejects.toThrow('Для источника CAMPAIGN требуется campaignId');
    await expect(service.getAttributionOrderDetails({
      ...filters,
      source: 'DIRECT',
      campaignId: 'campaign_1',
    })).rejects.toThrow('Для источника DIRECT campaignId не передаётся');
    await expect(service.getAttributionOrderDetails({
      ...filters,
      source: 'DIRECT',
      page: Number.MAX_SAFE_INTEGER,
      limit: 100,
    })).rejects.toThrow('page и limit образуют слишком большое смещение');
  });

  it('отклоняет неполную, обратную и слишком широкую пару дат', () => {
    const { service } = makeService();

    expect(() => service.resolveFilters({ dateFrom: '2026-07-01' })).toThrow(BadRequestException);
    expect(() => service.resolveFilters({ dateFrom: '2026-07-10', dateTo: '2026-07-01' }))
      .toThrow('dateFrom не может быть позже dateTo');
    expect(() => service.resolveFilters({ dateFrom: '2025-01-01', dateTo: '2026-07-10' }))
      .toThrow('Период отчёта не может превышать 366 дней');
  });
});
