import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Prisma, type EsimProduct } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/common/prisma/prisma.service';
import { getProductDataTypeLabel } from '@shared/product-data-type';
import {
  getProductMarkupPercent,
  getProviderPriceRubOrNull,
  getProviderPriceUsdOrNull,
} from '@shared/product-pricing';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import {
  ProductExportQueryDto,
  productExportQueryToListFilters,
} from './dto/product-export-query.dto';
import { buildProductsWhere } from './products.filters';
import { buildProductsOrderBy } from './products.sorting';
import { parseProductDataAmountMb } from './products.sort-keys';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_PRODUCTS_EXPORT_ROWS = 50000;

export interface ProductsExportFile {
  buffer: Buffer;
  filename: string;
  mimeType: typeof XLSX_MIME_TYPE;
}

type NumericLike = Prisma.Decimal | number | string | null | undefined;

interface ProductExportRow {
  id: string;
  name: string;
  country: string;
  region: string;
  description: string;
  dataAmount: string;
  validityDays: number;
  duration: number | null;
  dataType: string;
  speed: string;
  providerPriceUsd: number | null;
  providerPriceRub: number | null;
  providerCostPerGbRub: number | null;
  ourPriceRub: number | null;
  markupPercent: number | null;
  providerId: string;
  providerName: string;
  isActive: string;
  stock: number;
  badge: string;
  tags: string;
  supportTopup: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProductsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async buildExcelFile(query: ProductExportQueryDto): Promise<ProductsExportFile> {
    const filters = productExportQueryToListFilters(query);
    const where = buildProductsWhere(filters);
    const orderBy = buildProductsOrderBy(filters);
    const [total, pricingSettings] = await Promise.all([
      this.prisma.esimProduct.count({ where }),
      this.systemSettingsService.getPricingSettings(),
    ]);

    if (total > MAX_PRODUCTS_EXPORT_ROWS) {
      throw new PayloadTooLargeException(
        `Экспорт содержит ${total} тарифов. Уточните фильтры: лимит Excel-выгрузки ${MAX_PRODUCTS_EXPORT_ROWS} строк.`,
      );
    }

    const products = await this.prisma.esimProduct.findMany({ where, orderBy });

    return {
      buffer: await this.buildWorkbookBuffer(products, pricingSettings.exchangeRate),
      filename: this.buildFilename(),
      mimeType: XLSX_MIME_TYPE,
    };
  }

  private async buildWorkbookBuffer(products: EsimProduct[], exchangeRate: number): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Mojo Mobile Admin';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Products', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 28 },
      { header: 'Название', key: 'name', width: 42 },
      { header: 'Код страны', key: 'country', width: 14 },
      { header: 'Регион/покрытие', key: 'region', width: 28 },
      { header: 'Описание', key: 'description', width: 48 },
      { header: 'Объём', key: 'dataAmount', width: 14 },
      { header: 'Срок, дней', key: 'validityDays', width: 12 },
      { header: 'Duration', key: 'duration', width: 12 },
      { header: 'Тип данных', key: 'dataType', width: 34 },
      { header: 'Скорость', key: 'speed', width: 18 },
      { header: 'Цена поставщика, USD', key: 'providerPriceUsd', width: 20 },
      { header: 'Цена поставщика, RUB', key: 'providerPriceRub', width: 20 },
      { header: 'Себестоимость / GB, RUB', key: 'providerCostPerGbRub', width: 24 },
      { header: 'Наша цена, RUB', key: 'ourPriceRub', width: 18 },
      { header: 'Наценка, %', key: 'markupPercent', width: 14 },
      { header: 'Provider ID', key: 'providerId', width: 28 },
      { header: 'Provider', key: 'providerName', width: 16 },
      { header: 'Активен', key: 'isActive', width: 12 },
      { header: 'Stock', key: 'stock', width: 10 },
      { header: 'Бейдж', key: 'badge', width: 18 },
      { header: 'Теги', key: 'tags', width: 34 },
      { header: 'Top-up', key: 'supportTopup', width: 10 },
      { header: 'Создан', key: 'createdAt', width: 20 },
      { header: 'Обновлён', key: 'updatedAt', width: 20 },
    ];

    products
      .map((product) => this.toExportRow(product, exchangeRate))
      .forEach((row) => worksheet.addRow(row));

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columns.length },
    };

    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    worksheet.getColumn('description').alignment = { wrapText: true, vertical: 'top' };
    worksheet.getColumn('region').alignment = { wrapText: true, vertical: 'top' };
    worksheet.getColumn('tags').alignment = { wrapText: true, vertical: 'top' };
    worksheet.getColumn('providerPriceUsd').numFmt = '$#,##0.00';
    worksheet.getColumn('providerPriceRub').numFmt = '#,##0.00';
    worksheet.getColumn('providerCostPerGbRub').numFmt = '#,##0.00';
    worksheet.getColumn('ourPriceRub').numFmt = '#,##0.00';
    worksheet.getColumn('markupPercent').numFmt = '0.00';
    worksheet.getColumn('createdAt').numFmt = 'yyyy-mm-dd hh:mm';
    worksheet.getColumn('updatedAt').numFmt = 'yyyy-mm-dd hh:mm';

    const workbookBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(workbookBuffer);
  }

  private toExportRow(product: EsimProduct, exchangeRate: number): ProductExportRow {
    const providerPriceUsd = getProviderPriceUsdOrNull(product.providerPrice);
    const providerPriceRub = getProviderPriceRubOrNull(product.providerPrice, exchangeRate);
    const ourPriceRub = this.toFiniteNumber(product.ourPrice);
    const dataAmountGb = this.resolveDataAmountGb(product);

    return {
      id: product.id,
      name: product.name,
      country: product.country,
      region: product.region ?? '',
      description: product.description ?? '',
      dataAmount: product.dataAmount,
      validityDays: product.validityDays,
      duration: product.duration ?? null,
      dataType: getProductDataTypeLabel(product.dataType, product.isUnlimited),
      speed: product.speed ?? '',
      providerPriceUsd,
      providerPriceRub: providerPriceRub === null ? null : this.roundTwoDecimals(providerPriceRub),
      providerCostPerGbRub: providerPriceRub !== null && dataAmountGb !== null
        ? this.roundTwoDecimals(providerPriceRub / dataAmountGb)
        : null,
      ourPriceRub,
      markupPercent: providerPriceRub !== null && ourPriceRub !== null && providerPriceRub > 0
        ? this.roundTwoDecimals(getProductMarkupPercent(product.providerPrice, product.ourPrice, exchangeRate))
        : null,
      providerId: product.providerId,
      providerName: product.providerName,
      isActive: product.isActive ? 'Да' : 'Нет',
      stock: product.stock,
      badge: product.badge ?? '',
      tags: product.tags.join(', '),
      supportTopup: product.supportTopup ? 'Да' : 'Нет',
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private resolveDataAmountGb(product: EsimProduct): number | null {
    const dataAmountMb = this.toFiniteNumber(product.dataAmountMb ?? parseProductDataAmountMb(product.dataAmount));
    if (dataAmountMb === null || dataAmountMb <= 0) return null;

    return dataAmountMb / 1024;
  }

  private toFiniteNumber(value: NumericLike): number | null {
    if (value === null || value === undefined || value === '') return null;

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private roundTwoDecimals(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private buildFilename(): string {
    return `products_${new Date().toISOString().slice(0, 10)}.xlsx`;
  }
}
