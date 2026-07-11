import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import {
  MarketingAttributionOrderDetailsQueryDto,
  MarketingAttributionReportQueryDto,
} from './dto/marketing-attribution-report-query.dto';
import { MarketingAttributionReportExportService } from './marketing-attribution-report-export.service';
import { MarketingAttributionReportService } from './marketing-attribution-report.service';

@ApiTags('marketing-attribution')
@ApiBearerAuth()
@Controller('marketing-attribution/reports')
@UseGuards(JwtAdminGuard)
export class MarketingAttributionReportsController {
  constructor(
    private readonly reports: MarketingAttributionReportService,
    private readonly exportService: MarketingAttributionReportExportService,
  ) {}

  @Get('attribution/orders')
  @ApiOperation({ summary: 'Получить конкретные primary-заказы из строки attribution отчёта' })
  getAttributionOrderDetails(@Query() query: MarketingAttributionOrderDetailsQueryDto) {
    return this.reports.getAttributionOrderDetails(query);
  }

  @Get('attribution')
  @ApiOperation({ summary: 'Получить source-backed отчёт по marketing attribution' })
  getAttributionReport(@Query() query: MarketingAttributionReportQueryDto) {
    return this.reports.getAttributionReport(query);
  }

  @Get('cpa')
  @ApiOperation({ summary: 'Получить ledger-backed отчёт по блогерам и CPA' })
  getCpaReport(@Query() query: MarketingAttributionReportQueryDto) {
    return this.reports.getCpaReport(query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Экспортировать marketing attribution и CPA в XLSX' })
  async exportExcel(
    @Query() query: MarketingAttributionReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.exportService.buildExcelFile(query);
    const encodedFilename = encodeURIComponent(file.filename);

    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.filename}"; filename*=UTF-8''${encodedFilename}`,
      'Content-Length': file.buffer.length.toString(),
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });

    return new StreamableFile(file.buffer);
  }
}
