import { ProductsService } from './products.service';
import type { PrismaService } from '@/common/prisma/prisma.service';
import type { EsimProviderService } from '../esim-provider/esim-provider.service';
import type { SystemSettingsService } from '../system-settings/system-settings.service';
import type { EsimAccessPackage } from '../esim-provider/providers/esimaccess.provider';
import type { ProductDataType } from '@shared/product-data-type';

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

function makePackage(overrides: Partial<EsimAccessPackage>): EsimAccessPackage {
  return {
    packageCode: 'pkg',
    name: 'Thailand 1GB 7Days',
    slug: 'th-1gb-7days',
    location: 'Thailand',
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
    ...overrides,
  };
}

describe('ProductsService.syncWithProvider dataType modeling', () => {
  it('пишет dataType=3/4 без ложного speed-reduced поведения', async () => {
    const createProduct = jest.fn().mockResolvedValue({ id: 'created-product' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: createProduct,
        },
      },
      esimProviderService: {
        getPackages: jest.fn(async (_country, dataType: ProductDataType) => {
          if (dataType === 3) {
            return [{
              packageCode: 'daily-cutoff',
              name: 'Thailand 1GB/Day Service Cut-off',
              slug: 'th-1gb-day-cutoff',
              location: 'Thailand',
              locationCode: 'TH',
              price: 20000,
              currencyCode: 'USD',
              volume: 1073741824,
              smsVolume: 0,
              duration: 1,
              durationUnit: 'DAY',
              validity: 180,
              speed: '',
              fupPolicy: '384 Kbps',
              supportTopup: false,
              dataType: 3,
            }];
          }

          if (dataType === 4) {
            return [{
              packageCode: 'daily-unlimited',
              name: 'Thailand Daily Unlimited',
              slug: 'th-daily-unlimited',
              location: 'Thailand',
              locationCode: 'TH',
              price: 30000,
              currencyCode: 'USD',
              volume: 0,
              smsVolume: 0,
              duration: 1,
              durationUnit: 'DAY',
              validity: 30,
              speed: '512 Kbps',
              supportTopup: false,
              dataType: 4,
            }];
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

    expect(result.synced).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.breakdown?.dataTypes).toEqual({
      1: 0,
      2: 0,
      3: 1,
      4: 1,
    });
    expect(createProduct).toHaveBeenCalledTimes(2);
    expect(createProduct).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: 'daily-cutoff',
        dataType: 3,
        dataAmount: '1 GB',
        description: '1 GB в день. Срок выбирается при покупке (до 180 дней). После лимита доступ отключается до следующего дневного периода.',
        isUnlimited: true,
        speed: '',
      }),
    });
    expect(createProduct).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: 'daily-unlimited',
        dataType: 4,
        dataAmount: 'Безлимит',
        description: 'Дневной безлимит. Срок выбирается при покупке (до 30 дней).',
        isUnlimited: true,
        speed: '',
      }),
    });
  });

  it('repair-ит ourPrice, когда legacy daily продукт по providerId стал standard', async () => {
    const updateProduct = jest.fn().mockResolvedValue({ id: 'legacy-daily' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'legacy-daily',
            dataType: null,
            isUnlimited: true,
            ourPrice: 100,
            tags: [],
          }),
          update: updateProduct,
        },
      },
      esimProviderService: {
        getPackages: jest.fn(async (_country, dataType: ProductDataType) => (
          dataType === 1
            ? [makePackage({
              packageCode: 'legacy-daily-provider',
              dataType: 1,
              price: 70000,
              duration: 7,
              validity: 7,
            })]
            : []
        )),
      },
      systemSettingsService: {
        getPricingSettings: jest.fn().mockResolvedValue({
          exchangeRate: 100,
          defaultMarkupPercent: 0,
        }),
      },
    });

    const result = await service.syncWithProvider();

    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);
    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: 'legacy-daily' },
      data: expect.objectContaining({
        dataType: 1,
        duration: 7,
        isUnlimited: false,
        ourPrice: 700,
        providerPrice: 70000,
        validityDays: 7,
      }),
    });
  });

  it('repair-ит ourPrice, когда standard продукт стал daily', async () => {
    const updateProduct = jest.fn().mockResolvedValue({ id: 'standard-product' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'standard-product',
            dataType: 1,
            isUnlimited: false,
            ourPrice: 700,
            tags: [],
          }),
          update: updateProduct,
        },
      },
      esimProviderService: {
        getPackages: jest.fn(async (_country, dataType: ProductDataType) => (
          dataType === 2
            ? [makePackage({
              packageCode: 'standard-provider',
              dataType: 2,
              name: 'Thailand 1GB/Day FUP1Mbps',
              price: 10000,
              duration: 1,
              validity: 30,
            })]
            : []
        )),
      },
      systemSettingsService: {
        getPricingSettings: jest.fn().mockResolvedValue({
          exchangeRate: 100,
          defaultMarkupPercent: 0,
        }),
      },
    });

    const result = await service.syncWithProvider();

    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);
    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: 'standard-product' },
      data: expect.objectContaining({
        dataType: 2,
        duration: 1,
        isUnlimited: true,
        ourPrice: 100,
        providerPrice: 10000,
        validityDays: 30,
      }),
    });
  });

  it('сохраняет ручную ourPrice, когда provider меняет subtype внутри daily semantics', async () => {
    const updateProduct = jest.fn().mockResolvedValue({ id: 'daily-product' });
    const service = makeServiceWithDeps({
      prisma: {
        esimProduct: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'daily-product',
            dataType: 2,
            isUnlimited: true,
            ourPrice: 999,
            tags: [],
          }),
          update: updateProduct,
        },
      },
      esimProviderService: {
        getPackages: jest.fn(async (_country, dataType: ProductDataType) => (
          dataType === 3
            ? [makePackage({
              packageCode: 'daily-provider',
              dataType: 3,
              name: 'Thailand 1GB/Day Service Cut-off',
              price: 20000,
              duration: 1,
              validity: 180,
            })]
            : []
        )),
      },
      systemSettingsService: {
        getPricingSettings: jest.fn().mockResolvedValue({
          exchangeRate: 100,
          defaultMarkupPercent: 0,
        }),
      },
    });

    const result = await service.syncWithProvider();

    expect(result.synced).toBe(1);
    expect(result.errors).toBe(0);
    expect(updateProduct).toHaveBeenCalledTimes(1);
    expect(updateProduct.mock.calls[0]?.[0].data).toEqual(expect.objectContaining({
      dataType: 3,
      isUnlimited: true,
      providerPrice: 20000,
      validityDays: 180,
    }));
    expect(updateProduct.mock.calls[0]?.[0].data).not.toHaveProperty('ourPrice');
  });
});
