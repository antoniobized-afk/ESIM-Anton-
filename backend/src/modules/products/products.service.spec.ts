/**
 * Unit-тесты для чистых эвристик ProductsService.
 *
 * Намеренно не используем NestJS DI — `inferTagsFromPackage` это чистая функция
 * без побочных эффектов, поэтому тестируем её через минимальный stub-инстанс,
 * чтобы не таскать в тесты Prisma и провайдера.
 */
import { ProductsService } from './products.service';
import { buildProductsWhere } from './products.filters';

function makeService(): ProductsService {
  // ProductsService хранит только инжекты; для проверки чистой функции
  // достаточно прокинуть «пустые» зависимости через приведение типа.
  return new (ProductsService as any)({}, {}, {}) as ProductsService;
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

describe('buildProductsWhere', () => {
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
});
