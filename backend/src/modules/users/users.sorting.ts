import type { Prisma } from '@prisma/client';
import {
  getDefaultUserSortOrder,
  isUserSortField,
  normalizeUserSortField,
  normalizeUserSortOrder,
  type UserSortField,
  type UserSortOrder,
} from '@shared/user-sorting';

export type { UserSortField, UserSortOrder } from '@shared/user-sorting';

export interface UserSortInput {
  sortBy?: unknown;
  sortOrder?: unknown;
}

export interface ResolvedUserSort {
  field: UserSortField;
  order: UserSortOrder;
}

export function resolveUserSort(input?: UserSortInput): ResolvedUserSort {
  const field = normalizeUserSortField(input?.sortBy);
  const hasInvalidSortField = input?.sortBy !== undefined && !isUserSortField(input.sortBy);
  const order = hasInvalidSortField
    ? getDefaultUserSortOrder(field)
    : normalizeUserSortOrder(input?.sortOrder, field);

  return { field, order };
}

function primaryOrderBy(sort: ResolvedUserSort): Prisma.UserOrderByWithRelationInput {
  switch (sort.field) {
    case 'id':
      return { id: sort.order };
    case 'balance':
      return { balance: sort.order };
    case 'bonusBalance':
      return { bonusBalance: sort.order };
    case 'totalSpent':
      return { totalSpent: sort.order };
    case 'loyaltyLevel':
      return { loyaltyLevel: { minSpent: sort.order } };
    case 'createdAt':
      return { createdAt: sort.order };
  }
}

export function buildUsersOrderBy(input?: UserSortInput): Prisma.UserOrderByWithRelationInput[] {
  const sort = resolveUserSort(input);
  const orderBy = [primaryOrderBy(sort)];

  if (sort.field !== 'id') {
    orderBy.push({ id: 'asc' });
  }

  return orderBy;
}
