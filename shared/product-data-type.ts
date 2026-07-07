export const PRODUCT_DATA_TYPES = [1, 2, 3, 4] as const;

export type ProductDataType = (typeof PRODUCT_DATA_TYPES)[number];
export type ProductDataTypeValue = ProductDataType | null;

export const DAILY_PRODUCT_DATA_TYPES = [2, 3, 4] as const satisfies readonly ProductDataType[];

export const PRODUCT_DATA_TYPE_PROVIDER_LABELS: Record<ProductDataType, string> = {
  1: 'Data in Total',
  2: 'Daily Limit (Speed Reduced)',
  3: 'Daily Limit (Service Cut-off)',
  4: 'Daily Unlimited',
};

export const PRODUCT_DATA_TYPE_LABELS: Record<ProductDataType, string> = {
  1: 'Пакет данных на весь срок',
  2: 'Дневной лимит (снижение скорости)',
  3: 'Дневной лимит (отключение услуги)',
  4: 'Дневной безлимит',
};

export const LEGACY_DAILY_PRODUCT_DATA_TYPE_LABEL = 'Дневной тариф (тип не определён)';

export const PRODUCT_DATA_TYPE_OPTIONS = PRODUCT_DATA_TYPES.map((value) => ({
  value,
  label: PRODUCT_DATA_TYPE_LABELS[value],
}));

export const DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE = 'daily';
export type ProductDataTypeSelector = ProductDataType | typeof DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE;

export function normalizeProductDataType(value: unknown): ProductDataType | undefined {
  let numericValue: number | undefined;

  if (typeof value === 'number' && Number.isInteger(value)) {
    numericValue = value;
  } else if (typeof value === 'string') {
    const trimmedValue = value.trim();
    numericValue = /^[1-4]$/.test(trimmedValue) ? Number(trimmedValue) : undefined;
  }

  return PRODUCT_DATA_TYPES.includes(numericValue as ProductDataType)
    ? (numericValue as ProductDataType)
    : undefined;
}

export function normalizeProductDataTypeSelector(value: unknown): ProductDataTypeSelector | undefined {
  if (typeof value === 'string' && value.trim() === DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE) {
    return DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE;
  }

  return normalizeProductDataType(value);
}

export function getProductDataTypeLabel(value: unknown, fallbackIsUnlimited = false): string {
  const normalized = normalizeProductDataType(value);
  if (normalized) return PRODUCT_DATA_TYPE_LABELS[normalized];

  return fallbackIsUnlimited ? LEGACY_DAILY_PRODUCT_DATA_TYPE_LABEL : PRODUCT_DATA_TYPE_LABELS[1];
}

export function isDailyProductDataType(value: unknown, fallbackIsUnlimited = false): boolean {
  const normalized = normalizeProductDataType(value);
  return normalized === undefined ? fallbackIsUnlimited : normalized !== 1;
}

export function isSpeedReducedDailyProductDataType(value: unknown): boolean {
  return normalizeProductDataType(value) === 2;
}

export function isServiceCutOffDailyProductDataType(value: unknown): boolean {
  return normalizeProductDataType(value) === 3;
}

export function isDailyUnlimitedProductDataType(value: unknown): boolean {
  return normalizeProductDataType(value) === 4;
}
