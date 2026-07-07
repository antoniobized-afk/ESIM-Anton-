import type { Prisma } from '@prisma/client';
import {
  DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE,
  DAILY_PRODUCT_DATA_TYPES,
  normalizeProductDataTypeSelector,
} from '@shared/product-data-type';

export type ProductDataUnit = 'MB' | 'GB';

export interface ProductListFilters {
  country?: string;
  isActive?: boolean;
  search?: string;
  tariffType?: 'standard' | 'unlimited';
  dataType?: string | number;
  dataAmount?: string;
  dataUnit?: string;
  durationDays?: string | number;
}

function normalizeDataUnit(value?: string): ProductDataUnit | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized === 'MB' || normalized === 'GB' ? normalized : undefined;
}

function normalizePositiveInteger(value?: string | number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDataAmount(value?: string) {
  const trimmed = value?.trim().replace(',', '.');
  if (!trimmed) return undefined;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(MB|GB)?$/i);
  if (!match) return undefined;

  const parsedNumber = Number(match[1]);
  if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) return undefined;

  return {
    amount: String(parsedNumber),
    unit: normalizeDataUnit(match[2]),
  };
}

function buildDataAmountWhere(filters: ProductListFilters): Prisma.EsimProductWhereInput | undefined {
  const parsedAmount = parseDataAmount(filters.dataAmount);
  const selectedUnit = normalizeDataUnit(filters.dataUnit);
  const unit = selectedUnit ?? parsedAmount?.unit;
  const hasRawAmount = Boolean(filters.dataAmount?.trim());

  if (hasRawAmount && !parsedAmount) return { id: '__invalid_data_amount__' };
  if (!parsedAmount && !unit) return undefined;

  if (!parsedAmount && unit) {
    return {
      dataAmount: {
        endsWith: unit,
        mode: 'insensitive',
      },
    };
  }

  if (!parsedAmount) return undefined;

  if (selectedUnit && parsedAmount.unit && selectedUnit !== parsedAmount.unit) {
    return { id: '__invalid_data_amount_unit__' };
  }

  const units = unit ? [unit] : (['MB', 'GB'] satisfies ProductDataUnit[]);

  return {
    OR: units.flatMap((currentUnit) => [
      { dataAmount: { equals: `${parsedAmount.amount} ${currentUnit}`, mode: 'insensitive' } },
      { dataAmount: { equals: `${parsedAmount.amount}${currentUnit}`, mode: 'insensitive' } },
    ]),
  };
}

export function buildProductsWhere(filters?: ProductListFilters): Prisma.EsimProductWhereInput {
  const search = filters?.search?.trim();
  const durationDays = normalizePositiveInteger(filters?.durationDays);
  const dataType = normalizeProductDataTypeSelector(filters?.dataType);
  const conditions: Prisma.EsimProductWhereInput[] = [];

  if (filters?.isActive !== undefined) conditions.push({ isActive: filters.isActive });
  if (filters?.country) conditions.push({ country: filters.country });
  if (dataType === DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE) {
    conditions.push({ dataType: { in: [...DAILY_PRODUCT_DATA_TYPES] } });
  } else if (dataType) {
    conditions.push({ dataType });
  } else if (filters?.tariffType === 'unlimited') {
    conditions.push({ dataType: { in: [...DAILY_PRODUCT_DATA_TYPES] } });
  } else if (filters?.tariffType === 'standard') {
    conditions.push({ dataType: 1 });
  }
  if (durationDays) conditions.push({ validityDays: durationDays });

  const dataAmountWhere = filters ? buildDataAmountWhere(filters) : undefined;
  if (dataAmountWhere) conditions.push(dataAmountWhere);

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } },
        { dataAmount: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}
