import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE,
  PRODUCT_DATA_TYPES,
  normalizeProductDataTypeSelector,
  type ProductDataTypeSelector,
} from '@shared/product-data-type';
import type { ProductDataUnit, ProductListFilters } from '../products.filters';

const PRODUCT_DATA_TYPE_SELECTORS = [
  ...PRODUCT_DATA_TYPES,
  DAILY_PRODUCT_DATA_TYPE_FILTER_VALUE,
] as const;

const PRODUCT_DATA_UNITS = ['MB', 'GB'] as const;
const TARIFF_TYPES = ['standard', 'unlimited'] as const;

function trimOptionalString(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalStringList(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : [value];
  const normalized: string[] = [];

  values.forEach((item) => {
    const trimmed = trimOptionalString(item);
    if (typeof trimmed === 'string' && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  });

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return value;
}

function normalizeOptionalInteger(value: unknown): unknown {
  const normalized = trimOptionalString(value);
  if (normalized === undefined) return undefined;

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : value;
}

function normalizeOptionalDataUnit(value: unknown): unknown {
  const normalized = trimOptionalString(value);
  return typeof normalized === 'string' ? normalized.toUpperCase() : normalized;
}

function normalizeOptionalDataTypeSelector(value: unknown): unknown {
  const normalized = trimOptionalString(value);
  if (normalized === undefined) return undefined;

  return normalizeProductDataTypeSelector(normalized) ?? normalized;
}

export class ProductExportQueryDto {
  @Transform(({ value }) => normalizeOptionalStringList(value))
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  country?: string[];

  @Transform(({ value }) => normalizeOptionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(({ value }) => trimOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(256)
  search?: string;

  @Transform(({ value }) => trimOptionalString(value))
  @IsOptional()
  @IsIn(TARIFF_TYPES)
  tariffType?: 'standard' | 'unlimited';

  @Transform(({ value }) => normalizeOptionalDataTypeSelector(value))
  @IsOptional()
  @IsIn(PRODUCT_DATA_TYPE_SELECTORS, {
    message: 'dataType должен быть одним из значений: 1, 2, 3, 4 или daily',
  })
  dataType?: ProductDataTypeSelector;

  @Transform(({ value }) => trimOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  dataAmount?: string;

  @Transform(({ value }) => normalizeOptionalDataUnit(value))
  @IsOptional()
  @IsIn(PRODUCT_DATA_UNITS)
  dataUnit?: ProductDataUnit;

  @Transform(({ value }) => normalizeOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @Transform(({ value }) => trimOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sortBy?: string;

  @Transform(({ value }) => trimOptionalString(value))
  @IsOptional()
  @IsString()
  @MaxLength(8)
  sortOrder?: string;

  @Transform(({ value }) => normalizeOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(({ value }) => normalizeOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

export function productExportQueryToListFilters(query: ProductExportQueryDto): ProductListFilters {
  return {
    country: query.country,
    isActive: query.isActive,
    search: query.search,
    tariffType: query.tariffType,
    dataType: query.dataType,
    dataAmount: query.dataAmount,
    dataUnit: query.dataUnit,
    durationDays: query.durationDays,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };
}
