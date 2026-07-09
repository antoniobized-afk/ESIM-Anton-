import type { Prisma } from '@prisma/client';
import {
  normalizeProductSortField,
  normalizeProductSortOrder,
  type ProductSortField,
  type ProductSortOrder,
} from '@shared/product-sorting';

export type { ProductSortField, ProductSortOrder } from '@shared/product-sorting';

export interface ProductSortInput {
  sortBy?: unknown;
  sortOrder?: unknown;
}

export interface ResolvedProductSort {
  field: ProductSortField;
  order: ProductSortOrder;
}

export function resolveProductSort(input?: ProductSortInput): ResolvedProductSort {
  const field = normalizeProductSortField(input?.sortBy);
  const order = normalizeProductSortOrder(input?.sortOrder, field);

  return { field, order };
}

function nullableOrderBy(
  field: 'dataAmountMb' | 'providerCostPerGb' | 'markupRatio' | 'dataType' | 'badge',
  order: ProductSortOrder,
): Prisma.EsimProductOrderByWithRelationInput {
  return { [field]: { sort: order, nulls: 'last' } };
}

function primaryOrderBy(sort: ResolvedProductSort): Prisma.EsimProductOrderByWithRelationInput {
  switch (sort.field) {
    case 'name':
      return { name: sort.order };
    case 'providerPrice':
      return { providerPrice: sort.order };
    case 'dataAmountMb':
      return nullableOrderBy('dataAmountMb', sort.order);
    case 'validityDays':
      return { validityDays: sort.order };
    case 'providerCostPerGb':
      return nullableOrderBy('providerCostPerGb', sort.order);
    case 'ourPrice':
      return { ourPrice: sort.order };
    case 'markupRatio':
      return nullableOrderBy('markupRatio', sort.order);
    case 'country':
      return { country: sort.order };
    case 'dataType':
      return nullableOrderBy('dataType', sort.order);
    case 'badge':
      return nullableOrderBy('badge', sort.order);
    case 'isActive':
      return { isActive: sort.order };
  }
}

export function buildProductsOrderBy(input?: ProductSortInput): Prisma.EsimProductOrderByWithRelationInput[] {
  const sort = resolveProductSort(input);
  const tieBreakers: Array<{
    field: ProductSortField | 'id';
    orderBy: Prisma.EsimProductOrderByWithRelationInput;
  }> = [
    { field: 'country', orderBy: { country: 'asc' } },
    { field: 'ourPrice', orderBy: { ourPrice: 'asc' } },
    { field: 'id', orderBy: { id: 'asc' } },
  ];

  return [
    primaryOrderBy(sort),
    ...tieBreakers
      .filter((tieBreaker) => tieBreaker.field !== sort.field)
      .map((tieBreaker) => tieBreaker.orderBy),
  ];
}
