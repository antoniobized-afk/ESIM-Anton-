import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { MarketingAttributionReportQueryDto } from './dto/marketing-attribution-report-query.dto';
import { MarketingAttributionReportService } from './marketing-attribution-report.service';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_EXPORT_ROWS = 10_000;

export type MarketingAttributionExportFile = {
  buffer: Buffer;
  filename: string;
  mimeType: typeof XLSX_MIME_TYPE;
};

@Injectable()
export class MarketingAttributionReportExportService {
  constructor(private readonly reports: MarketingAttributionReportService) {}

  async buildExcelFile(
    query: MarketingAttributionReportQueryDto,
  ): Promise<MarketingAttributionExportFile> {
    const [attribution, cpa] = await Promise.all([
      this.reports.getAttributionReport(query),
      this.reports.getCpaReport(query),
    ]);
    const totalRows = attribution.rows.length + cpa.rows.length;

    if (totalRows > MAX_EXPORT_ROWS) {
      throw new PayloadTooLargeException(
        `В выгрузке ${totalRows} строк. Уточните фильтры: лимит XLSX — ${MAX_EXPORT_ROWS} строк.`,
      );
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Mojo Mobile Admin';
    workbook.created = new Date();

    this.addAttributionSheet(workbook, attribution);
    this.addCpaSheet(workbook, cpa);

    const workbookBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(workbookBuffer),
      filename: `marketing_attribution_${attribution.filters.dateFrom}_${attribution.filters.dateTo}_${attribution.filters.model.toLowerCase()}.xlsx`,
      mimeType: XLSX_MIME_TYPE,
    };
  }

  private addAttributionSheet(
    workbook: ExcelJS.Workbook,
    report: Awaited<ReturnType<MarketingAttributionReportService['getAttributionReport']>>,
  ) {
    const worksheet = workbook.addWorksheet('Атрибуция', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = [
      { header: 'Период с', key: 'dateFrom', width: 13 },
      { header: 'Период по', key: 'dateTo', width: 13 },
      { header: 'Модель', key: 'model', width: 17 },
      { header: 'Канал', key: 'channel', width: 22 },
      { header: 'Код кампании', key: 'shortCode', width: 18 },
      { header: 'Кампания', key: 'name', width: 32 },
      { header: 'UTM source', key: 'utmSource', width: 20 },
      { header: 'UTM medium', key: 'utmMedium', width: 20 },
      { header: 'UTM campaign', key: 'utmCampaign', width: 24 },
      { header: 'Активна', key: 'isActive', width: 11 },
      { header: 'Клики', key: 'clicks', width: 12 },
      { header: 'Регистрации', key: 'registrations', width: 15 },
      { header: 'Первые покупки', key: 'firstPurchases', width: 17 },
      { header: 'Повторные покупки', key: 'repeatPurchases', width: 19 },
      { header: 'Покупки всего', key: 'purchases', width: 16 },
      { header: 'Выручка, ₽', key: 'revenue', width: 16 },
    ];

    report.rows.forEach((row) => worksheet.addRow({
      dateFrom: this.dateCell(report.filters.dateFrom),
      dateTo: this.dateCell(report.filters.dateTo),
      model: report.filters.model === 'FIRST_TOUCH' ? 'Первое касание' : 'Последнее касание',
      channel: report.filters.channel ?? 'Все каналы',
      shortCode: row.campaign?.shortCode ?? '',
      name: row.campaign?.name ?? 'Прямой трафик',
      utmSource: row.campaign?.utmSource ?? '',
      utmMedium: row.campaign?.utmMedium ?? '',
      utmCampaign: row.campaign?.utmCampaign ?? '',
      isActive: row.campaign ? (row.campaign.isActive ? 'Да' : 'Нет') : '',
      clicks: row.metrics.clicks,
      registrations: row.metrics.registrations,
      firstPurchases: row.metrics.firstPurchases,
      repeatPurchases: row.metrics.repeatPurchases,
      purchases: row.metrics.purchases,
      revenue: Number(row.metrics.revenue),
    }));

    this.formatSheet(worksheet, ['dateFrom', 'dateTo'], ['revenue']);
  }

  private addCpaSheet(
    workbook: ExcelJS.Workbook,
    report: Awaited<ReturnType<MarketingAttributionReportService['getCpaReport']>>,
  ) {
    const worksheet = workbook.addWorksheet('Блогеры и CPA', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = [
      { header: 'Период с', key: 'dateFrom', width: 13 },
      { header: 'Период по', key: 'dateTo', width: 13 },
      { header: 'Модель', key: 'model', width: 17 },
      { header: 'Канал', key: 'channel', width: 22 },
      { header: 'Код кампании', key: 'shortCode', width: 18 },
      { header: 'Кампания', key: 'name', width: 30 },
      { header: 'Referral link', key: 'referralCode', width: 20 },
      { header: 'Партнёр', key: 'partner', width: 26 },
      { header: 'Первые покупки', key: 'firstPurchases', width: 17 },
      { header: 'Повторные покупки', key: 'repeatPurchases', width: 19 },
      { header: 'Покупки всего', key: 'purchases', width: 16 },
      { header: 'Выручка, ₽', key: 'revenue', width: 16 },
      { header: 'Начислений', key: 'rewardsCount', width: 14 },
      { header: 'Выплата, ₽', key: 'payout', width: 15 },
      { header: 'Фактический CPA, ₽', key: 'actualCpa', width: 20 },
      { header: 'На баланс, ₽', key: 'balancePayout', width: 16 },
      { header: 'Внешняя выплата, ₽', key: 'externalPayout', width: 20 },
      { header: 'Режим не указан, ₽', key: 'unknownPayout', width: 20 },
      { header: 'Активна', key: 'isActive', width: 11 },
    ];

    report.rows.forEach((row) => worksheet.addRow({
      dateFrom: this.dateCell(report.filters.dateFrom),
      dateTo: this.dateCell(report.filters.dateTo),
      model: report.filters.model === 'FIRST_TOUCH' ? 'Первое касание' : 'Последнее касание',
      channel: report.filters.channel ?? 'Все каналы',
      shortCode: row.campaign.shortCode,
      name: row.campaign.name,
      referralCode: row.referralLink.code,
      partner: this.partnerLabel(row.partner),
      firstPurchases: row.metrics.firstPurchases,
      repeatPurchases: row.metrics.repeatPurchases,
      purchases: row.metrics.purchases,
      revenue: Number(row.metrics.revenue),
      rewardsCount: row.metrics.rewardsCount,
      payout: Number(row.metrics.payout),
      actualCpa: row.metrics.actualCpa === null ? null : Number(row.metrics.actualCpa),
      balancePayout: this.payoutForMode(row.payoutModeSplit, 'BALANCE'),
      externalPayout: this.payoutForMode(row.payoutModeSplit, 'EXTERNAL'),
      unknownPayout: this.payoutForMode(row.payoutModeSplit, 'UNKNOWN'),
      isActive: row.campaign.isActive ? 'Да' : 'Нет',
    }));

    this.formatSheet(
      worksheet,
      ['dateFrom', 'dateTo'],
      ['revenue', 'payout', 'actualCpa', 'balancePayout', 'externalPayout', 'unknownPayout'],
    );
  }

  private formatSheet(
    worksheet: ExcelJS.Worksheet,
    dateColumns: string[],
    moneyColumns: string[],
  ) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columns.length },
    };
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    dateColumns.forEach((key) => { worksheet.getColumn(key).numFmt = 'yyyy-mm-dd'; });
    moneyColumns.forEach((key) => { worksheet.getColumn(key).numFmt = '#,##0.00'; });
  }

  private payoutForMode(
    splits: Array<{ payoutMode: string; payout: { toString(): string } }>,
    payoutMode: 'BALANCE' | 'EXTERNAL' | 'UNKNOWN',
  ) {
    const split = splits.find((item) => item.payoutMode === payoutMode);
    return split ? Number(split.payout) : 0;
  }

  private partnerLabel(partner: {
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    referralCode: string;
  }) {
    const name = [partner.firstName, partner.lastName].filter(Boolean).join(' ').trim();
    return name || (partner.username ? `@${partner.username}` : partner.referralCode);
  }

  private dateCell(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }
}
