import { buildSyncedProductPlan } from './products.sync-model';
import type { EsimAccessPackage } from '../esim-provider/providers/esimaccess.provider';

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

describe('buildSyncedProductPlan', () => {
  it('моделирует dataType=1 как пакет данных на весь срок', () => {
    expect(buildSyncedProductPlan(makePackage({ dataType: 1 }))).toEqual({
      dataAmount: '1 GB',
      dataType: 1,
      description: '1 GB на 7 дней',
      duration: 7,
      isDailyPlan: false,
      speed: '',
      validityDays: 7,
    });
  });

  it('моделирует dataType=2 как дневной лимит со снижением скорости', () => {
    expect(buildSyncedProductPlan(makePackage({
      dataType: 2,
      duration: 1,
      name: 'Thailand 1GB/Day FUP1Mbps',
      validity: 180,
    }))).toEqual({
      dataAmount: '1 GB',
      dataType: 2,
      description: '1 GB в день. Срок выбирается при покупке (до 180 дней). После лимита: 1 Mbps.',
      duration: 1,
      isDailyPlan: true,
      speed: '1 Mbps',
      validityDays: 180,
    });
  });

  it('моделирует dataType=3 как дневной лимит с отключением услуги, без speed fallback', () => {
    expect(buildSyncedProductPlan(makePackage({
      dataType: 3,
      duration: 1,
      fupPolicy: '384 Kbps',
      name: 'Thailand 1GB/Day FUP1Mbps Service Cut-off',
      validity: 180,
    }))).toEqual({
      dataAmount: '1 GB',
      dataType: 3,
      description: '1 GB в день. Срок выбирается при покупке (до 180 дней). После лимита доступ отключается до следующего дневного периода.',
      duration: 1,
      isDailyPlan: true,
      speed: '',
      validityDays: 180,
    });
  });

  it('моделирует dataType=4 как дневной безлимит, без дневного лимита и speed', () => {
    expect(buildSyncedProductPlan(makePackage({
      dataType: 4,
      duration: 1,
      name: 'Thailand Daily Unlimited',
      speed: '512 Kbps',
      validity: 30,
      volume: 0,
    }))).toEqual({
      dataAmount: 'Безлимит',
      dataType: 4,
      description: 'Дневной безлимит. Срок выбирается при покупке (до 30 дней).',
      duration: 1,
      isDailyPlan: true,
      speed: '',
      validityDays: 30,
    });
  });
});
