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
  rewardsCount: 2n,
  payout: new Prisma.Decimal('50.00'),
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

  it('даёт Telegram facts при null contact field: join не зависит от users/legacy identity', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw.mockResolvedValue([attributionRow]);

    await service.getAttributionReport({
      ...filters,
      channel: MarketingTouchChannel.TELEGRAM_BOT,
    });
    const sql = queryText(prisma.$queryRaw.mock.calls[0]);

    expect(sql).toContain('ROW_NUMBER() OVER');
    expect(sql).toContain('o."parentOrderId" IS NULL');
    expect(sql).toContain('o.status = \'COMPLETED\'');
    expect(sql).toContain('oma."firstChannel"::text');
    expect(sql).not.toMatch(/JOIN users|user_identities/);
    expect(sql).not.toMatch(/telegramId|authProvider|providerId/);
  });

  it('строит CPA только по successful matching ledger и snapshot payout mode', async () => {
    const { prisma, service } = makeService();
    prisma.$queryRaw
      .mockResolvedValueOnce([cpaRow])
      .mockResolvedValueOnce([{
        campaignId: 'campaign_1',
        payoutMode: 'EXTERNAL',
        rewardsCount: 2n,
        payout: new Prisma.Decimal('50.00'),
      }]);

    const result = await service.getCpaReport(filters);
    const cpaSql = queryText(prisma.$queryRaw.mock.calls[0]);
    const splitSql = queryText(prisma.$queryRaw.mock.calls[1]);

    expect(cpaSql).toContain('t."orderId" = so."orderId"');
    expect(cpaSql).toContain('t."referralLinkId" = mc."referralLinkId"');
    expect(cpaSql).toContain("t.type = 'REFERRAL_BONUS'");
    expect(cpaSql).toContain("t.status = 'SUCCEEDED'");
    expect(cpaSql).not.toMatch(/bonusPercent|referralBonusPercent/);
    expect(splitSql).toContain("t.metadata->>'payoutMode'");
    expect(result.rows[0].metrics.actualCpa?.toString()).toBe('25');
    expect(result.rows[0].payoutModeSplit).toEqual([
      expect.objectContaining({ payoutMode: 'EXTERNAL', rewardsCount: 2 }),
    ]);
    expect(result.totals.payout.toString()).toBe('50');
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
