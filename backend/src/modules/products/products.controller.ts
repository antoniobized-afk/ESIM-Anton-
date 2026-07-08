import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ProductsService } from './products.service';
import { ProductsExportService } from './products-export.service';
import { JwtAdminGuard } from '@/common/auth/jwt-user.guard';
import type { ProductDataUnit } from './products.filters';
import { BulkToggleByDataTypeDto } from './dto/bulk-toggle-by-data-type.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductExportQueryDto } from './dto/product-export-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsExportService: ProductsExportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Получить все продукты' })
  async findAll(
    @Query('country') country?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('tariffType') tariffType?: 'standard' | 'unlimited',
    @Query('dataType') dataType?: string,
    @Query('dataAmount') dataAmount?: string,
    @Query('dataUnit') dataUnit?: ProductDataUnit,
    @Query('durationDays') durationDays?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('paginated') paginated?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    // isActive приходит как строка "true"/"false", конвертируем в boolean
    const isActiveFilter = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    const filters = {
      country,
      isActive: isActiveFilter,
      search,
      tariffType,
      dataType,
      dataAmount,
      dataUnit,
      durationDays,
      sortBy,
      sortOrder,
    };

    if (paginated === 'true') {
      return this.productsService.findAllPaginated({
        ...filters,
        page: +page,
        limit: +limit,
      });
    }

    return this.productsService.findAll(filters);
  }

  @Get('countries')
  @ApiOperation({ summary: 'Получить список стран' })
  async getCountries() {
    return this.productsService.getCountries();
  }

  @Get('export')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Экспортировать продукты в Excel' })
  async exportExcel(
    @Query() query: ProductExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.productsExportService.buildExcelFile(query);
    const encodedFilename = encodeURIComponent(file.filename);

    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.filename}"; filename*=UTF-8''${encodedFilename}`,
      'Content-Length': file.buffer.length.toString(),
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });

    return new StreamableFile(file.buffer);
  }

  @Post('sync')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Синхронизировать с провайдером' })
  async sync() {
    return this.productsService.syncWithProvider();
  }

  @Post('dedupe')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Найти и скрыть дубликаты тарифов в БД (только админ)' })
  async dedupe(@Query('dryRun') dryRun?: string) {
    return this.productsService.dedupeProducts(dryRun === 'true');
  }

  // =====================================================
  // МАССОВЫЕ ОПЕРАЦИИ
  // =====================================================

  @Post('bulk/toggle-active')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Массовое включение/выключение продуктов' })
  async bulkToggleActive(@Body() body: { ids: string[]; isActive: boolean }) {
    return this.productsService.bulkUpdateActive(body.ids, body.isActive);
  }

  @Post('bulk/toggle-by-type')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Включить/выключить все тарифы по provider dataType' })
  async bulkToggleByType(@Body() body: BulkToggleByDataTypeDto) {
    return this.productsService.bulkToggleByDataType(body.dataType, body.isActive);
  }

  @Post('bulk/set-badge')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Массовая установка бейджа' })
  async bulkSetBadge(@Body() body: { ids: string[]; badge: string | null; badgeColor: string | null }) {
    return this.productsService.bulkSetBadge(body.ids, body.badge, body.badgeColor);
  }

  @Post('bulk/set-markup')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Массовая установка наценки' })
  async bulkSetMarkup(@Body() body: { ids: string[]; markupPercent: number }) {
    return this.productsService.bulkSetMarkup(body.ids, body.markupPercent);
  }

  @Post('reprice')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Пересчитать цены всех продуктов по текущим настройкам' })
  async repriceAll() {
    return this.productsService.repriceAllProducts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить продукт по ID' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать продукт' })
  async create(@Body() createDto: CreateProductDto) {
    return this.productsService.create(createDto);
  }

  @Put(':id')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обновить продукт' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateProductDto) {
    return this.productsService.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удалить продукт' })
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
