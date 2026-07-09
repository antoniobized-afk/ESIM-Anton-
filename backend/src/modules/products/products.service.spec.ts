/**
 * Unit-тесты для чистых эвристик ProductsService.
 *
 * Намеренно не используем NestJS DI — `inferTagsFromPackage` это чистая функция
 * без побочных эффектов, поэтому тестируем её через минимальный stub-инстанс,
 * чтобы не таскать в тесты Prisma и провайдера.
 */
import { ProductsService } from './products.service';
import { buildProductsWhere } from './products.filters';
import { buildProductSortKeyData, parseProductDataAmountMb } from './products.sort-keys';
import { buildProductsOrderBy, resolveProductSort } from './products.sorting';
import type { PrismaService } from '@/common/prisma/prisma.service';
import type { EsimProviderService } from '../esim-provider/esim-provider.service';
import type { SystemSettingsService } from '../system-settings/system-settings.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import { PRODUCT_DATA_TYPE_LABELS, type ProductDataType } from '@shared/product-data-type';
import { Prisma } from '@prisma/client';

function makeService(): ProductsService {
  // ProductsService хранит только инжекты; для проверки чистой функции
  // достаточно прокинуть «пустые» зависимости через приведение типа.
  return new (ProductsService as any)({}, {}, {}) as ProductsService;
}

function makeServiceWithDeps(deps: {
  prisma?: unknown;
  esimProviderService?: unknown;
  systemSettingsService?: unknown;
}): ProductsService {
  return new ProductsService(
    deps.prisma as PrismaService,
    deps.esimProviderService as EsimProviderService,
    deps.systemSettingsService as SystemSettingsService,
  );
}

describe('ProductsService.inferTagsFromPackage', () => {
  const service = makeService();

  describe('Китай: country=CN (locationCode), location="China"', () => {
    it('распознаёт материковый Китай по location при locationCode="CN"', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'China Mainland 5GB 30 days', location: 'China' },
        'CN',
      );
      expect(tags).toContain('Материковый Китай');
      expect(tags).toContain('Не гонконгский IP');
    });

    it('распознаёт «No Hong Kong» вариант', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'China(no Hong Kong) 1GB', location: 'China' },
        'CN',
      );
      expect(tags).toContain('Материковый Китай');
      expect(tags).toContain('Не гонконгский IP');
    });

    it('распознаёт «Excluding HK»', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'China Excluding HK 3GB', location: 'China' },
        'CN',
      );
      expect(tags).toContain('Материковый Китай');
    });

    it('распознаёт явный HK IP', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'China via HK IP unlimited', location: 'China' },
        'CN',
      );
      expect(tags).toContain('Гонконгский IP');
      expect(tags).not.toContain('Материковый Китай');
    });

    it('обычный «China 5GB» (без HK-маркеров) не получает Mainland-тег', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'China 5GB 30 days', location: 'China' },
        'CN',
      );
      expect(tags).not.toContain('Материковый Китай');
      expect(tags).not.toContain('Гонконгский IP');
    });
  });

  describe('Не гонконгский IP (любая страна)', () => {
    it('Таиланд с (nonhkip) получает «Не гонконгский IP»', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'Thailand 1GB 7Days (nonhkip)' },
        'TH',
      );
      expect(tags).toContain('Не гонконгский IP');
      expect(tags).not.toContain('Материковый Китай');
    });

    it('другая страна с non-hk маркером тоже получает тег', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'Vietnam 3GB non-hk 30days' },
        'VN',
      );
      expect(tags).toContain('Не гонконгский IP');
      expect(tags).not.toContain('Материковый Китай');
    });

    it('«via HK» для любой страны → «Гонконгский IP»', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'Thailand 5GB via HK IP' },
        'TH',
      );
      expect(tags).toContain('Гонконгский IP');
      expect(tags).not.toContain('Не гонконгский IP');
    });

    it('обычный пакет без HK-маркеров не получает тегов IP', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'Thailand 5GB 30 days' },
        'TH',
      );
      expect(tags).not.toContain('Не гонконгский IP');
      expect(tags).not.toContain('Гонконгский IP');
    });
  });

  describe('Скоростные/функциональные пометки', () => {
    it('распознаёт 5G', () => {
      expect(
        service.inferTagsFromPackage({ name: 'Europe 10GB 5G' }, 'FR'),
      ).toContain('5G');
    });

    it('4G/LTE', () => {
      expect(
        service.inferTagsFromPackage({ name: 'USA 5GB LTE' }, 'US'),
      ).toContain('4G/LTE');
    });

    it('5G имеет приоритет над 4G/LTE', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'EU 5G/LTE multi pack' },
        'FR',
      );
      expect(tags).toContain('5G');
      expect(tags).not.toContain('4G/LTE');
    });

    it('«5GB» не должно превратиться в тег «5G» (объём ≠ поколение сети)', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'USA 5GB 30 days' },
        'US',
      );
      expect(tags).not.toContain('5G');
    });

    it('«USA 4G LTE 5GB» — корректно ловит 4G/LTE без 5G', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'USA 4G LTE 5GB' },
        'US',
      );
      expect(tags).toContain('4G/LTE');
      expect(tags).not.toContain('5G');
    });

    it('распознаёт hotspot/tethering', () => {
      expect(
        service.inferTagsFromPackage({ name: 'USA Hotspot 5GB' }, 'US'),
      ).toContain('Раздача Wi-Fi');
    });

    it('распознаёт voice/SMS', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'Voice + SMS bundle' },
        'US',
      );
      expect(tags).toContain('Голосовые звонки');
      expect(tags).toContain('SMS');
    });
  });

  describe('Региональные/дневные', () => {
    it('распознаёт daily', () => {
      expect(
        service.inferTagsFromPackage({ name: 'Daily 1GB/day' }, 'EU'),
      ).toContain('Дневной лимит');
    });

    it('распознаёт мульти-страна по name', () => {
      const tags = service.inferTagsFromPackage(
        { name: 'Asia Regional 10GB' },
        'AS',
      );
      expect(tags).toContain('Мульти-страна');
    });
  });

  describe('Edge cases', () => {
    it('пустые входы возвращают пустой массив', () => {
      expect(service.inferTagsFromPackage({}, '')).toEqual([]);
    });

    it('null/undefined в pkg-полях не падает', () => {
      expect(
        service.inferTagsFromPackage(
          { name: null, slug: undefined, description: null, location: null },
          'FR',
        ),
      ).toEqual([]);
    });

    it('теги уникальны: 5G + 5G в разных местах строки → один тег', () => {
      const tags = service.inferTagsFromPackage(
        { name: '5G fast', description: '5G pack' },
        'EU',
      );
      expect(tags.filter((t) => t === '5G').length).toBe(1);
    });
  });
});

describe('ProductsService product write normalization', () => {
  const baseCreatePayload: CreateProductDto = {
    country: 'TH',
    name: 'Thailand 1GB',
    dataAmount: '1 GB',
    validityDays: 7,
    providerPrice: 10000,
    ourPrice: 150,
    providerId: 'TH_1GB_7D',
    isActive: true,
  };

  it('на create пересчитывает isUnlimited из dataType и не доверяет входному boolean', async () => {
    const createProduct = jest.fn().mockResolvedValue({ id: 'created-product' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          create: createProduct,
        },
      },
    });
    const payload: CreateProductDto & { isUnlimited?: boolean } = {
      ...baseCreatePayload,
      dataType: 3,
      isUnlimited: false,
    };
    await service.create(payload);
    expect(createProduct).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dataType: 3,
        isUnlimited: true,
      }),
    });
  });

  it('на create без dataType пишет стандартный тип и сбрасывает legacy isUnlimited', async () => {
    const createProduct = jest.fn().mockResolvedValue({ id: 'created-product' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          create: createProduct,
        },
      },
    });
    const payload: CreateProductDto & { isUnlimited?: boolean } = {
      ...baseCreatePayload,
      isUnlimited: true,
    };
    await service.create(payload);
    expect(createProduct).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dataType: 1,
        isUnlimited: false,
      }),
    });
  });

  it('на create нормализует badge и не сохраняет пустой бейдж/цвет', async () => {
    const createProduct = jest.fn().mockResolvedValue({ id: 'created-product' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          create: createProduct,
        },
      },
    });

    await service.create({
      ...baseCreatePayload,
      badge: '  ',
      badgeColor: 'red',
    });

    expect(createProduct).toHaveBeenCalledWith({
      data: expect.objectContaining({
        badge: null,
        badgeColor: null,
      }),
    });
  });

  it('на create триммит реальный badge и его цвет', async () => {
    const createProduct = jest.fn().mockResolvedValue({ id: 'created-product' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          create: createProduct,
        },
      },
    });

    await service.create({
      ...baseCreatePayload,
      badge: '  HIT  ',
      badgeColor: '  blue  ',
    });

    expect(createProduct).toHaveBeenCalledWith({
      data: expect.objectContaining({
        badge: 'HIT',
        badgeColor: 'blue',
      }),
    });
  });

  it('на create не сохраняет orphan badgeColor без badge', async () => {
    const createProduct = jest.fn().mockResolvedValue({ id: 'created-product' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          create: createProduct,
        },
      },
    });

    await service.create({
      ...baseCreatePayload,
      badgeColor: 'red',
    });

    expect(createProduct).toHaveBeenCalledWith({
      data: expect.objectContaining({
        badgeColor: null,
      }),
    });
  });

  it('на update при смене dataType пересчитывает isUnlimited и не доверяет входному boolean', async () => {
    const updateProduct = jest.fn().mockResolvedValue({ id: 'product-id' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findUnique: jest.fn().mockResolvedValue({ id: 'product-id' }),
          update: updateProduct,
        },
      },
    });
    const payload: UpdateProductDto & { isUnlimited?: boolean } = {
      dataType: 1,
      isUnlimited: true,
    };
    await service.update('product-id', payload);
    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: 'product-id' },
      data: {
        dataType: 1,
        isUnlimited: false,
      },
    });
  });

  it('на partial update без dataType не даёт isUnlimited отдельного write-path', async () => {
    const updateProduct = jest.fn().mockResolvedValue({ id: 'product-id' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findUnique: jest.fn().mockResolvedValue({ id: 'product-id' }),
          update: updateProduct,
        },
      },
    });
    const payload: UpdateProductDto & { isUnlimited?: boolean } = {
      isActive: false,
      isUnlimited: true,
    };
    await service.update('product-id', payload);
    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: 'product-id' },
      data: {
        isActive: false,
      },
    });
  });

  it('на partial update цены пересчитывает sort keys из текущего продукта', async () => {
    const updateProduct = jest.fn().mockResolvedValue({ id: 'product-id' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'product-id',
            dataAmount: '1 GB',
            providerPrice: new Prisma.Decimal(10000),
            ourPrice: new Prisma.Decimal(150),
          }),
          update: updateProduct,
        },
      },
    });

    await service.update('product-id', { ourPrice: 200 });

    const data = updateProduct.mock.calls[0][0].data;
    expect(data.dataAmountMb.toNumber()).toBe(1024);
    expect(data.providerCostPerGb.toNumber()).toBe(10000);
    expect(data.markupRatio.toNumber()).toBeCloseTo(0.02);
  });

  it('на update с dataType=null сохраняет legacy unknown и не сбрасывает его в standard', async () => {
    const updateProduct = jest.fn().mockResolvedValue({ id: 'product-id' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findUnique: jest.fn().mockResolvedValue({ id: 'product-id' }),
          update: updateProduct,
        },
      },
    });
    const payload: UpdateProductDto & { dataType: null; isUnlimited?: boolean } = {
      dataType: null,
      isUnlimited: true,
    };
    await service.update('product-id', payload);
    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: 'product-id' },
      data: {},
    });
  });

  it('на update превращает blank badge в null и чистит цвет', async () => {
    const updateProduct = jest.fn().mockResolvedValue({ id: 'product-id' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findUnique: jest.fn().mockResolvedValue({ id: 'product-id' }),
          update: updateProduct,
        },
      },
    });

    await service.update('product-id', { badge: '   ', badgeColor: 'red' });

    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: 'product-id' },
      data: {
        badge: null,
        badgeColor: null,
      },
    });
  });
});

describe('Products sorting contract', () => {
  it('нормализует sort whitelist и default direction', () => {
    expect(resolveProductSort({ sortBy: 'dataAmountMb', sortOrder: 'desc' })).toEqual({
      field: 'dataAmountMb',
      order: 'desc',
    });
    expect(resolveProductSort({ sortBy: 'dataAmount', sortOrder: 'sideways' })).toEqual({
      field: 'country',
      order: 'asc',
    });
    expect(resolveProductSort({ sortBy: 'isActive' })).toEqual({
      field: 'isActive',
      order: 'desc',
    });
  });

  it('строит stable orderBy с nulls last для вычисляемых ключей', () => {
    expect(buildProductsOrderBy({ sortBy: 'dataAmountMb', sortOrder: 'asc' })).toEqual([
      { dataAmountMb: { sort: 'asc', nulls: 'last' } },
      { country: 'asc' },
      { ourPrice: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('сохраняет текущий default order country -> ourPrice -> id', () => {
    expect(buildProductsOrderBy()).toEqual([
      { country: 'asc' },
      { ourPrice: 'asc' },
      { id: 'asc' },
    ]);
  });
});

describe('Product sort key calculation', () => {
  it('нормализует GB/MB в MB для числовой сортировки Data', () => {
    expect(parseProductDataAmountMb('1 GB')?.toNumber()).toBe(1024);
    expect(parseProductDataAmountMb('500 MB')?.toNumber()).toBe(500);
    expect(parseProductDataAmountMb('1,5 GB')?.toNumber()).toBe(1536);
    expect(parseProductDataAmountMb('Безлимит')).toBeNull();
  });

  it('считает provider cost per GB и markup ratio без зависимости от UI курса', () => {
    const sortKeys = buildProductSortKeyData({
      dataAmount: '500 MB',
      providerPrice: 10000,
      ourPrice: 150,
    });

    expect(sortKeys.dataAmountMb?.toNumber()).toBe(500);
    expect(sortKeys.providerCostPerGb?.toNumber()).toBeCloseTo(20480);
    expect(sortKeys.markupRatio?.toNumber()).toBeCloseTo(0.015);
  });

  it('оставляет вычисляемые ключи null для неделимого объёма или нулевой provider price', () => {
    expect(buildProductSortKeyData({
      dataAmount: 'Безлимит',
      providerPrice: 10000,
      ourPrice: 150,
    })).toMatchObject({
      dataAmountMb: null,
      providerCostPerGb: null,
    });
    expect(buildProductSortKeyData({
      dataAmount: '1 GB',
      providerPrice: 0,
      ourPrice: 150,
    })).toMatchObject({
      providerCostPerGb: null,
      markupRatio: null,
    });
  });
});

describe('ProductsService.bulkToggleByDataType', () => {
  it('массово переключает aggregate daily через provider dataType in [2,3,4]', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 7 });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          updateMany,
        },
      },
    });

    const result = await service.bulkToggleByDataType('daily', false);

    expect(updateMany).toHaveBeenCalledWith({
      where: { dataType: { in: [2, 3, 4] } },
      data: { isActive: false },
    });
    expect(updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isUnlimited: expect.any(Boolean) }) }),
    );
    expect(result).toMatchObject({
      success: true,
      updated: 7,
      dataType: 'daily',
      isActive: false,
    });
  });

  it('массово переключает точный daily subtype без затрагивания соседних subtypes', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          updateMany,
        },
      },
    });

    const result = await service.bulkToggleByDataType(3, true);

    expect(updateMany).toHaveBeenCalledWith({
      where: { dataType: 3 },
      data: { isActive: true },
    });
    expect(result).toMatchObject({
      success: true,
      updated: 2,
      dataType: 3,
      isActive: true,
    });
  });

  it('массово переключает standard по dataType=1, а не legacy isUnlimited=false', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 5 });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          updateMany,
        },
      },
    });

    await service.bulkToggleByDataType(1, true);

    expect(updateMany).toHaveBeenCalledWith({
      where: { dataType: 1 },
      data: { isActive: true },
    });
  });
});

describe('ProductsService.bulkSetBadge', () => {
  it('нормализует blank badge в null перед updateMany', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          updateMany,
        },
      },
    });

    const result = await service.bulkSetBadge(['p1', 'p2', 'p3'], '   ', 'red');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2', 'p3'] } },
      data: {
        badge: null,
        badgeColor: null,
      },
    });
    expect(result.message).toBe('Бейдж удален у 3 продуктов');
  });

  it('триммит реальный badge перед updateMany', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          updateMany,
        },
      },
    });

    await service.bulkSetBadge(['p1'], '  HIT  ', '  blue  ');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1'] } },
      data: {
        badge: 'HIT',
        badgeColor: 'blue',
      },
    });
  });
});

describe('ProductsService.dedupeProducts', () => {
  it('не считает дублями дневные тарифы с разным provider dataType', async () => {
    const updateMany = jest.fn();
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'type-2',
              country: 'TH',
              dataAmount: '1 GB',
              validityDays: 180,
              dataType: 2,
              providerPrice: 10000,
              isUnlimited: true,
              name: 'Thailand 1GB Daily Speed Reduced',
              badge: null,
              tags: [],
              notes: null,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
            },
            {
              id: 'type-3',
              country: 'TH',
              dataAmount: '1 GB',
              validityDays: 180,
              dataType: 3,
              providerPrice: 10000,
              isUnlimited: true,
              name: 'Thailand 1GB Daily Cutoff',
              badge: null,
              tags: [],
              notes: null,
              createdAt: new Date('2026-01-02T00:00:00.000Z'),
            },
          ]),
          updateMany,
        },
        order: {
          groupBy: jest.fn().mockResolvedValue([]),
        },
      },
    });

    const result = await service.dedupeProducts(true);

    expect(result.groups).toBe(0);
    expect(result.deactivated).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('ProductsService.syncWithProvider', () => {
  it('запускает все provider dataType list calls параллельно до ожидания первого ответа', async () => {
    const resolvers: Array<() => void> = [];
    const getPackages = jest.fn((_country?: string, _dataType?: ProductDataType) => new Promise<[]>((resolve) => {
      resolvers.push(() => resolve([]));
    }));
    const service = makeServiceWithDeps({
      esimProviderService: { getPackages },
      systemSettingsService: {
        getPricingSettings: jest.fn().mockResolvedValue({
          exchangeRate: 100,
          defaultMarkupPercent: 0,
        }),
      },
    });

    const syncPromise = service.syncWithProvider();
    for (let attempt = 0; attempt < 10 && getPackages.mock.calls.length < 4; attempt += 1) {
      await Promise.resolve();
    }

    expect(getPackages.mock.calls.map(([, dataType]) => dataType)).toEqual([1, 2, 3, 4]);

    resolvers.forEach((resolve) => resolve());
    await expect(syncPromise).resolves.toMatchObject({
      success: false,
      synced: 0,
      errors: 1,
      providerErrors: 0,
      packageErrors: 0,
    });
  });

  it('сохраняет partial sync, когда один provider dataType list call падает', async () => {
    const createProduct = jest.fn().mockResolvedValue({ id: 'standard-ok' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: createProduct,
        },
      },
      esimProviderService: {
        getPackages: jest.fn(async (_country, dataType) => {
          if (dataType === 1) {
            return [
              {
                packageCode: 'standard-ok',
                name: 'Thailand 1GB 7Days',
                locationCode: 'TH',
                price: 10000,
                currencyCode: 'USD',
                volume: 1073741824,
                smsVolume: 0,
                duration: 7,
                durationUnit: 'DAY',
                validity: 7,
                speed: '',
                supportTopup: false,
                dataType: 1,
              },
            ];
          }

          if (dataType === 2) throw new Error('provider dataType=2 timeout');

          return [];
        }),
      },
      systemSettingsService: {
        getPricingSettings: jest.fn().mockResolvedValue({
          exchangeRate: 100,
          defaultMarkupPercent: 0,
        }),
      },
    });

    const result = await service.syncWithProvider();

    expect(result).toMatchObject({
      success: false,
      synced: 1,
      errors: 1,
      providerErrors: 1,
      packageErrors: 0,
      providerFailures: [
        {
          dataType: 2,
          label: PRODUCT_DATA_TYPE_LABELS[2],
          message: 'provider dataType=2 timeout',
        },
      ],
      breakdown: {
        standard: 1,
        unlimited: 0,
        dataTypes: {
          1: 1,
          2: 0,
          3: 0,
          4: 0,
        },
      },
    });
    expect(result.message).toContain('Частично синхронизировано');
    expect(result.message).toContain(PRODUCT_DATA_TYPE_LABELS[2]);
    expect(createProduct).toHaveBeenCalledTimes(1);
  });

  it('считает breakdown по успешно синхронизированным пакетам, а не по полученным от провайдера', async () => {
    const createProduct = jest.fn((args: { data: { providerId: string } }) => {
      if (args.data.providerId === 'daily-bad') {
        return Promise.reject(new Error('db rejected'));
      }

      return Promise.resolve({ id: args.data.providerId });
    });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: createProduct,
        },
      },
      esimProviderService: {
        getPackages: jest.fn(async (_country, dataType) => {
          if (dataType === 1) {
            return [
              {
                packageCode: 'standard-ok',
                name: 'Thailand 1GB 7Days',
                locationCode: 'TH',
                price: 10000,
                currencyCode: 'USD',
                volume: 1073741824,
                smsVolume: 0,
                duration: 7,
                durationUnit: 'DAY',
                validity: 7,
                speed: '',
                supportTopup: false,
                dataType: 1,
              },
            ];
          }

          if (dataType === 2) {
            return [
              {
                packageCode: 'daily-bad',
                name: 'Thailand 1GB/Day FUP1Mbps',
                locationCode: 'TH',
                price: 20000,
                currencyCode: 'USD',
                volume: 1073741824,
                smsVolume: 0,
                duration: 1,
                durationUnit: 'DAY',
                validity: 180,
                speed: '',
                supportTopup: false,
                dataType: 2,
              },
            ];
          }

          return [];
        }),
      },
      systemSettingsService: {
        getPricingSettings: jest.fn().mockResolvedValue({
          exchangeRate: 100,
          defaultMarkupPercent: 0,
        }),
      },
    });

    const result = await service.syncWithProvider();

    expect(result.success).toBe(false);
    expect(result.synced).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.providerErrors).toBe(0);
    expect(result.packageErrors).toBe(1);
    expect(result.breakdown?.standard).toBe(1);
    expect(result.breakdown?.unlimited).toBe(0);
    expect(result.breakdown?.dataTypes).toEqual({
      1: 1,
      2: 0,
      3: 0,
      4: 0,
    });
  });
});

describe('buildProductsWhere', () => {
  it('сохраняет backward-compatible точный country-фильтр для одного направления', () => {
    expect(buildProductsWhere({ country: 'CN' })).toEqual({
      AND: [{ country: 'CN' }],
    });
  });

  it('строит multi-country фильтр для повторяющихся country query params', () => {
    expect(buildProductsWhere({ country: ['CN', 'TH', 'CN', ' '] })).toEqual({
      AND: [{ country: { in: ['CN', 'TH'] } }],
    });
  });

  it('игнорирует malformed country query shape вместо падения', () => {
    expect(buildProductsWhere({ country: { nested: 'CN' } })).toEqual({});
  });

  it('игнорирует malformed string-like query filters вместо падения', () => {
    expect(buildProductsWhere({
      search: { value: 'China' },
      tariffType: { value: 'unlimited' },
      dataAmount: { value: '5' },
      dataUnit: { value: 'GB' },
      durationDays: { value: '30' },
      sortBy: { value: 'country' },
      sortOrder: { value: 'desc' },
    })).toEqual({});
  });

  it('строит точный фильтр по объёму и единице трафика', () => {
    expect(buildProductsWhere({ dataAmount: '5', dataUnit: 'GB' })).toEqual({
      AND: [
        {
          OR: [
            { dataAmount: { equals: '5 GB', mode: 'insensitive' } },
            { dataAmount: { equals: '5GB', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('фильтрует по единице трафика без указанного объёма', () => {
    expect(buildProductsWhere({ dataUnit: 'MB' })).toEqual({
      AND: [
        {
          dataAmount: {
            endsWith: 'MB',
            mode: 'insensitive',
          },
        },
      ],
    });
  });

  it('маппит Duration(days) на срок тарифа validityDays', () => {
    expect(buildProductsWhere({ durationDays: '30' })).toEqual({
      AND: [{ validityDays: 30 }],
    });
  });

  it('фильтрует по provider dataType и не сводит daily-типы к одному boolean', () => {
    expect(buildProductsWhere({ dataType: '3', tariffType: 'unlimited' })).toEqual({
      AND: [{ dataType: 3 }],
    });
  });

  it('не коэрсит boolean dataType=true в standard-фильтр', () => {
    expect(buildProductsWhere({ dataType: true as unknown as string })).toEqual({});
  });

  it('агрегирует все дневные provider-типы через dataType=daily, а не legacy isUnlimited', () => {
    expect(buildProductsWhere({ dataType: 'daily' })).toEqual({
      AND: [{ dataType: { in: [2, 3, 4] } }],
    });
  });

  it('маппит legacy tariffType aliases на provider dataType taxonomy', () => {
    expect(buildProductsWhere({ tariffType: 'standard' })).toEqual({
      AND: [{ dataType: 1 }],
    });
    expect(buildProductsWhere({ tariffType: 'unlimited' })).toEqual({
      AND: [{ dataType: { in: [2, 3, 4] } }],
    });
  });
});
