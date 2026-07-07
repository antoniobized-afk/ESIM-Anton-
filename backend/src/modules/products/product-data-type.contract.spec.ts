import {
  LEGACY_DAILY_PRODUCT_DATA_TYPE_LABEL,
  PRODUCT_DATA_TYPE_LABELS,
  PRODUCT_DATA_TYPE_OPTIONS,
  PRODUCT_DATA_TYPE_PROVIDER_LABELS,
  getProductDataTypeLabel,
  isDailyProductDataType,
  isDailyUnlimitedProductDataType,
  isServiceCutOffDailyProductDataType,
  isSpeedReducedDailyProductDataType,
  normalizeProductDataType,
  normalizeProductDataTypeSelector,
} from '@shared/product-data-type';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Product data type taxonomy', () => {
  it('matches the eSIM Access provider dataType taxonomy', () => {
    expect(PRODUCT_DATA_TYPE_PROVIDER_LABELS).toEqual({
      1: 'Data in Total',
      2: 'Daily Limit (Speed Reduced)',
      3: 'Daily Limit (Service Cut-off)',
      4: 'Daily Unlimited',
    });
  });

  it('keeps Russian labels aligned with provider meanings', () => {
    expect(PRODUCT_DATA_TYPE_LABELS).toEqual({
      1: 'Пакет данных на весь срок',
      2: 'Дневной лимит (снижение скорости)',
      3: 'Дневной лимит (отключение услуги)',
      4: 'Дневной безлимит',
    });
  });

  it('builds UI options from the canonical label owner', () => {
    expect(PRODUCT_DATA_TYPE_OPTIONS).toEqual([
      { value: 1, label: 'Пакет данных на весь срок' },
      { value: 2, label: 'Дневной лимит (снижение скорости)' },
      { value: 3, label: 'Дневной лимит (отключение услуги)' },
      { value: 4, label: 'Дневной безлимит' },
    ]);
  });

  it('does not label unknown legacy unlimited products as provider Daily Unlimited', () => {
    expect(getProductDataTypeLabel(undefined, true)).toBe(LEGACY_DAILY_PRODUCT_DATA_TYPE_LABEL);
  });

  it('keeps client reads rollout-safe when an old backend omits dataType', () => {
    expect(isDailyProductDataType(undefined, true)).toBe(true);
    expect(isDailyProductDataType(null, true)).toBe(true);
    expect(isDailyProductDataType('bad-provider-value', true)).toBe(true);
    expect(isDailyProductDataType(undefined, false)).toBe(false);
    expect(isDailyProductDataType(1, true)).toBe(false);
  });

  it('keeps legacy daily products as unknown during dataType migration', () => {
    const migrationSql = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260707120000_add_product_data_type/migration.sql'),
      'utf8',
    );

    expect(migrationSql).not.toMatch(/CASE\s+WHEN\s+"isUnlimited"\s+THEN\s+2\s+ELSE\s+1\s+END/i);
    expect(migrationSql).toMatch(/ADD\s+COLUMN\s+"dataType"\s+INTEGER;/i);
    expect(migrationSql).toMatch(/SET\s+"dataType"\s*=\s*1\s+WHERE\s+"isUnlimited"\s*=\s*false/i);
    expect(migrationSql).toMatch(/"dataType"\s+IS\s+NULL\s+OR\s+"dataType"\s+IN\s+\(1,\s*2,\s*3,\s*4\)/i);
  });

  it('keeps dataType behavior predicates aligned with provider semantics', () => {
    expect(isSpeedReducedDailyProductDataType(2)).toBe(true);
    expect(isSpeedReducedDailyProductDataType(3)).toBe(false);
    expect(isServiceCutOffDailyProductDataType(3)).toBe(true);
    expect(isServiceCutOffDailyProductDataType(4)).toBe(false);
    expect(isDailyUnlimitedProductDataType(4)).toBe(true);
    expect(isDailyUnlimitedProductDataType(2)).toBe(false);
  });

  it('normalizes only exact provider codes from numbers or trimmed strings', () => {
    expect(normalizeProductDataType(1)).toBe(1);
    expect(normalizeProductDataType(' 4 ')).toBe(4);
    expect(normalizeProductDataType(true)).toBeUndefined();
    expect(normalizeProductDataType(false)).toBeUndefined();
    expect(normalizeProductDataType([1])).toBeUndefined();
    expect(normalizeProductDataType({ valueOf: () => 1 })).toBeUndefined();
    expect(normalizeProductDataType(null)).toBeUndefined();
    expect(normalizeProductDataType('1.0')).toBeUndefined();
    expect(normalizeProductDataType('01')).toBeUndefined();
  });

  it('normalizes aggregate selector without coercing booleans or arrays', () => {
    expect(normalizeProductDataTypeSelector('daily')).toBe('daily');
    expect(normalizeProductDataTypeSelector(' 2 ')).toBe(2);
    expect(normalizeProductDataTypeSelector(true)).toBeUndefined();
    expect(normalizeProductDataTypeSelector([2])).toBeUndefined();
  });
});
