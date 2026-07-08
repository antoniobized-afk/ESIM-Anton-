import 'reflect-metadata';
import { StreamableFile } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import { ProductExportQueryDto } from './dto/product-export-query.dto';
import { ProductsController } from './products.controller';
import { ProductsExportService } from './products-export.service';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  const productsService = {} as ProductsService;
  const productsExportService = {
    buildExcelFile: jest.fn(),
  };
  const controller = new ProductsController(
    productsService,
    productsExportService as unknown as ProductsExportService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('exportExcel закрыт JwtAdminGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ProductsController.prototype.exportExcel);
    expect(guards).toEqual([JwtAdminGuard]);
  });

  it('exportExcel объявлен раньше параметрического findOne', () => {
    const methodOrder = Object.getOwnPropertyNames(ProductsController.prototype);
    expect(methodOrder.indexOf('exportExcel')).toBeLessThan(methodOrder.indexOf('findOne'));
  });

  it('exportExcel возвращает StreamableFile с XLSX headers', async () => {
    const query: ProductExportQueryDto = { country: 'CN', sortBy: 'markupRatio', sortOrder: 'desc' };
    const buffer = Buffer.from('xlsx');
    const response = {
      set: jest.fn(),
    };
    productsExportService.buildExcelFile.mockResolvedValue({
      buffer,
      filename: 'products_2026-07-08.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const file = await controller.exportExcel(
      query,
      response as unknown as Parameters<ProductsController['exportExcel']>[1],
    );

    expect(productsExportService.buildExcelFile).toHaveBeenCalledWith(query);
    expect(response.set).toHaveBeenCalledWith({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="products_2026-07-08.xlsx"; filename*=UTF-8\'\'products_2026-07-08.xlsx',
      'Content-Length': '4',
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    expect(file).toBeInstanceOf(StreamableFile);
  });
});
