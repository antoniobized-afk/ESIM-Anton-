import { Prisma } from '@prisma/client';

type NumericLike = Prisma.Decimal | number | string;

export interface ProductSortKeySource {
  dataAmount?: string | null;
  providerPrice?: NumericLike | null;
  ourPrice?: NumericLike | null;
}

export interface ProductSortKeyData {
  dataAmountMb: Prisma.Decimal | null;
  providerCostPerGb: Prisma.Decimal | null;
  markupRatio: Prisma.Decimal | null;
}

function toDecimal(value: NumericLike | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;

  try {
    const decimal = new Prisma.Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function toPositiveDecimal(value: NumericLike | null | undefined): Prisma.Decimal | null {
  const decimal = toDecimal(value);
  return decimal && decimal.gt(0) ? decimal : null;
}

export function parseProductDataAmountMb(dataAmount: string | null | undefined): Prisma.Decimal | null {
  const normalized = dataAmount?.trim().replace(',', '.');
  if (!normalized) return null;

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(MB|GB)$/i);
  if (!match) return null;

  const amount = toPositiveDecimal(match[1]);
  if (!amount) return null;

  return match[2].toUpperCase() === 'GB' ? amount.mul(1024) : amount;
}

export function buildProductSortKeyData(source: ProductSortKeySource): ProductSortKeyData {
  const dataAmountMb = parseProductDataAmountMb(source.dataAmount);
  const providerPrice = toPositiveDecimal(source.providerPrice);
  const ourPrice = toPositiveDecimal(source.ourPrice);
  const dataAmountGb = dataAmountMb && dataAmountMb.gt(0) ? dataAmountMb.div(1024) : null;

  return {
    dataAmountMb,
    providerCostPerGb: providerPrice && dataAmountGb ? providerPrice.div(dataAmountGb) : null,
    markupRatio: providerPrice && ourPrice ? ourPrice.div(providerPrice) : null,
  };
}
