import { PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { MarketingAttributionReportExportService } from './marketing-attribution-report-export.service';
import { MarketingAttributionReportService } from './marketing-attribution-report.service';

const filters = {
  dateFrom: '2026-07-01',
  dateTo: '2026-07-10',
  channel: null,
  model: 'LAST_TOUCH' as const,
};

const attributionRow = {
  campaign: {
    id: 'campaign_1',
    shortCode: 'AbCdEfGh1234',
    name: 'Summer launch',
    utmSource: 'blogger',
    utmMedium: 'social',
    utmCampaign: 'summer-2026',
    isActive: true,
    deactivatedAt: null,
  },
  metrics: {
    clicks: 12,
    registrations: 4,
    firstPurchases: 1,
    repeatPurchases: 1,
    purchases: 2,
    revenue: new Prisma.Decimal('1000.50'),
  },
};

const cpaRow = {
  campaign: { id: 'campaign_1', shortCode: 'AbCdEfGh1234', name: 'Summer launch', isActive: true, deactivatedAt: null },
  referralLink: { id: 'referral_1', code: 'blogger-code', label: 'Travel blogger' },
  partner: { userId: 'partner_1', firstName: 'Анна', lastName: null, username: null, referralCode: 'partner-code' },
  metrics: {
    firstPurchases: 1,
    repeatPurchases: 1,
    purchases: 2,
    revenue: new Prisma.Decimal('1000.50'),
    rewardsCount: 2,
    payout: new Prisma.Decimal('50.00'),
    actualCpa: new Prisma.Decimal('25.00'),
  },
  payoutModeSplit: [{ payoutMode: 'BALANCE' as const, rewardsCount: 2, payout: new Prisma.Decimal('50.00') }],
};

function makeReports() {
  return {
    getAttributionReport: jest.fn().mockResolvedValue({ filters, semantics: {}, totals: attributionRow.metrics, rows: [attributionRow] }),
    getCpaReport: jest.fn().mockResolvedValue({ filters, semantics: {}, totals: cpaRow.metrics, rows: [cpaRow] }),
  };
}

describe('MarketingAttributionReportExportService', () => {
  it('переиспользует одинаковые filters и создаёт numeric/date cells с русскими headers', async () => {
    const reports = makeReports();
    const service = new MarketingAttributionReportExportService(
      reports as unknown as MarketingAttributionReportService,
    );
    const query = { dateFrom: filters.dateFrom, dateTo: filters.dateTo, model: filters.model };

    const file = await service.buildExcelFile(query);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const attribution = workbook.getWorksheet('Атрибуция')!;
    const cpa = workbook.getWorksheet('Блогеры и CPA')!;

    expect(reports.getAttributionReport).toHaveBeenCalledWith(query);
    expect(reports.getCpaReport).toHaveBeenCalledWith(query);
    expect(file.filename).toBe('marketing_attribution_2026-07-01_2026-07-10_last_touch.xlsx');
    expect(attribution.getRow(1).getCell(1).value).toBe('Период с');
    expect(attribution.getRow(1).getCell(12).value).toBe('Регистрации');
    expect(attribution.getRow(2).getCell(1).value).toBeInstanceOf(Date);
    expect(attribution.getRow(2).getCell(16).value).toBe(1000.5);
    expect(cpa.getRow(1).getCell(15).value).toBe('Фактический CPA, ₽');
    expect(cpa.getRow(2).getCell(14).value).toBe(50);
    expect(cpa.getRow(2).getCell(15).value).toBe(25);
  });

  it('останавливает export при превышении общего row cap без silent truncation', async () => {
    const reports = makeReports();
    reports.getAttributionReport.mockResolvedValue({
      filters,
      semantics: {},
      totals: attributionRow.metrics,
      rows: Array.from({ length: 10_001 }, () => attributionRow),
    });
    reports.getCpaReport.mockResolvedValue({ filters, semantics: {}, totals: cpaRow.metrics, rows: [] });
    const service = new MarketingAttributionReportExportService(
      reports as unknown as MarketingAttributionReportService,
    );

    await expect(service.buildExcelFile({})).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
});
