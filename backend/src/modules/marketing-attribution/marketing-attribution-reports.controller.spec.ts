import 'reflect-metadata';
import { StreamableFile } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import { MarketingAttributionReportsController } from './marketing-attribution-reports.controller';
import { MarketingAttributionReportExportService } from './marketing-attribution-report-export.service';
import { MarketingAttributionReportService } from './marketing-attribution-report.service';

describe('MarketingAttributionReportsController', () => {
  const reports = {
    getAttributionReport: jest.fn(),
    getCpaReport: jest.fn(),
  };
  const exportService = { buildExcelFile: jest.fn() };
  const controller = new MarketingAttributionReportsController(
    reports as unknown as MarketingAttributionReportService,
    exportService as unknown as MarketingAttributionReportExportService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('закрывает весь report owner JwtAdminGuard для SUPPORT read access', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MarketingAttributionReportsController))
      .toEqual([JwtAdminGuard]);
  });

  it('возвращает XLSX с exposed authenticated download headers', async () => {
    const buffer = Buffer.from('xlsx');
    const response = { set: jest.fn() };
    exportService.buildExcelFile.mockResolvedValue({
      buffer,
      filename: 'marketing_attribution_2026-07-01_2026-07-10_last_touch.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const file = await controller.exportExcel(
      { dateFrom: '2026-07-01', dateTo: '2026-07-10' },
      response as unknown as Parameters<MarketingAttributionReportsController['exportExcel']>[1],
    );

    expect(response.set).toHaveBeenCalledWith({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="marketing_attribution_2026-07-01_2026-07-10_last_touch.xlsx"; filename*=UTF-8\'\'marketing_attribution_2026-07-01_2026-07-10_last_touch.xlsx',
      'Content-Length': '4',
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    expect(file).toBeInstanceOf(StreamableFile);
  });
});
