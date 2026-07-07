export const PRODUCT_SORT_FIELDS = [
  'name',
  'providerPrice',
  'dataAmountMb',
  'validityDays',
  'providerCostPerGb',
  'ourPrice',
  'markupRatio',
  'country',
  'dataType',
  'badge',
  'isActive',
] as const;

export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];
export type ProductSortOrder = 'asc' | 'desc';

export const DEFAULT_PRODUCT_SORT_FIELD: ProductSortField = 'country';

export const PRODUCT_SORT_DEFAULT_ORDERS: Record<ProductSortField, ProductSortOrder> = {
  name: 'asc',
  providerPrice: 'asc',
  dataAmountMb: 'asc',
  validityDays: 'asc',
  providerCostPerGb: 'asc',
  ourPrice: 'asc',
  markupRatio: 'asc',
  country: 'asc',
  dataType: 'asc',
  badge: 'asc',
  isActive: 'desc',
};

export function getDefaultProductSortOrder(field: ProductSortField): ProductSortOrder {
  return PRODUCT_SORT_DEFAULT_ORDERS[field];
}

export function normalizeProductSortField(value: unknown): ProductSortField {
  return typeof value === 'string' && PRODUCT_SORT_FIELDS.includes(value as ProductSortField)
    ? (value as ProductSortField)
    : DEFAULT_PRODUCT_SORT_FIELD;
}

export function normalizeProductSortOrder(value: unknown, field: ProductSortField): ProductSortOrder {
  if (value === 'asc' || value === 'desc') return value;
  return getDefaultProductSortOrder(field);
}
