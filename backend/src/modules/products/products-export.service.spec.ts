import { Prisma, type EsimProduct } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { ProductsExportService } from './products-export.service';
import {
  ProductExportQueryDto,
  productExportQueryToListFilters,
} from './dto/product-export-query.dto';
import { buildProductsWhere } from './products.filters';
import { buildProductsOrderBy } from './products.sorting';

describe('ProductsExportService', () => {
  const prisma = {
    esimProduct: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const systemSettingsService = {
    getPricingSettings: jest.fn(),
  };
  const service = new ProductsExportService(
    prisma as unknown as ConstructorParameters<typeof ProductsExportService>[0],
    systemSettingsService as unknown as ConstructorParameters<typeof ProductsExportService>[1],
  );

  const createdAt = new Date('2026-07-08T06:00:00.000Z');
  const updatedAt = new Date('2026-07-08T07:00:00.000Z');

  const product: EsimProduct = {
    id: 'product_1',
    country: 'CN',
    region: 'China',
    name: 'China 5GB 30 Days',
    description: 'Test package',
    dataAmount: '5 GB',
    validityDays: 30,
    duration: 30,
    dataType: 2,
    speed: '5G',
    providerPrice: new Prisma.Decimal(50000),
    ourPrice: new Prisma.Decimal(650),
    dataAmountMb: new Prisma.Decimal(5120),
    providerCostPerGb: new Prisma.Decimal(10000),
    markupRatio: new Prisma.Decimal(0.013),
    providerId: 'pkg_cn_5gb',
    providerName: 'esimaccess',
    isActive: true,
    stock: 999,
    createdAt,
    updatedAt,
    isUnlimited: true,
    badge: 'Хит',
    badgeColor: 'blue',
    tags: ['5G', 'Не гонконгский IP'],
    notes: null,
    supportTopup: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.esimProduct.count.mockResolvedValue(0);
    prisma.esimProduct.findMany.mockResolvedValue([]);
    systemSettingsService.getPricingSettings.mockResolvedValue({
      exchangeRate: 100,
      defaultMarkupPercent: 30,
    });
  });

  it('применяет list filters/sort и не добавляет pagination в export query', async () => {
    const query: ProductExportQueryDto = {
      country: ['CN', 'TH'],
      isActive: false,
      search: 'China',
      dataType: 'daily',
      dataAmount: '5',
      dataUnit: 'GB',
      durationDays: 30,
      sortBy: 'markupRatio',
      sortOrder: 'desc',
      page: 5,
      limit: 200,
    };
    const filters = productExportQueryToListFilters(query);

    expect(filters.country).toEqual(['CN', 'TH']);
    await service.buildExcelFile(query);

    expect(prisma.esimProduct.count).toHaveBeenCalledWith({
      where: buildProductsWhere(filters),
    });
    expect(prisma.esimProduct.findMany).toHaveBeenCalledWith({
      where: buildProductsWhere(filters),
      orderBy: buildProductsOrderBy(filters),
    });
    const findManyArgs = prisma.esimProduct.findMany.mock.calls[0][0];
    expect(findManyArgs).not.toHaveProperty('skip');
    expect(findManyArgs).not.toHaveProperty('take');
    expect(systemSettingsService.getPricingSettings).toHaveBeenCalledTimes(1);
  });

  it('создаёт XLSX с русскими заголовками, labels и числовыми ценовыми ячейками', async () => {
    prisma.esimProduct.count.mockResolvedValue(1);
    prisma.esimProduct.findMany.mockResolvedValue([product]);

    const file = await service.buildExcelFile({ sortBy: 'country', sortOrder: 'asc' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const worksheet = workbook.getWorksheet('Products');

    expect(file.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(file.filename).toMatch(/^products_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(worksheet).toBeDefined();
    expect(worksheet?.getRow(1).getCell(2).value).toBe('Название');
    expect(worksheet?.getRow(1).getCell(11).value).toBe('Цена поставщика, USD');

    const dataRow = worksheet!.getRow(2);
    expect(dataRow.getCell(2).value).toBe('China 5GB 30 Days');
    expect(dataRow.getCell(9).value).toBe('Дневной лимит (снижение скорости)');
    expect(dataRow.getCell(11).value).toBe(5);
    expect(dataRow.getCell(12).value).toBe(500);
    expect(dataRow.getCell(13).value).toBe(100);
    expect(dataRow.getCell(14).value).toBe(650);
    expect(dataRow.getCell(15).value).toBe(30);
    expect(dataRow.getCell(18).value).toBe('Да');
    expect(dataRow.getCell(21).value).toBe('5G, Не гонконгский IP');
    expect(dataRow.getCell(22).value).toBe('Да');
  });

  it('останавливает слишком большой export до загрузки всего dataset в память', async () => {
    prisma.esimProduct.count.mockResolvedValue(50001);

    await expect(service.buildExcelFile({})).rejects.toThrow(
      'лимит Excel-выгрузки 50000 строк',
    );
    expect(prisma.esimProduct.findMany).not.toHaveBeenCalled();
  });
});
