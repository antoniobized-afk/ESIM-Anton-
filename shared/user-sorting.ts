export const USER_SORT_FIELDS = [
  'id',
  'balance',
  'bonusBalance',
  'totalSpent',
  'loyaltyLevel',
  'createdAt',
] as const;

export type UserSortField = (typeof USER_SORT_FIELDS)[number];
export type UserSortOrder = 'asc' | 'desc';

export const DEFAULT_USER_SORT_FIELD: UserSortField = 'createdAt';

export const USER_SORT_DEFAULT_ORDERS: Record<UserSortField, UserSortOrder> = {
  id: 'asc',
  balance: 'desc',
  bonusBalance: 'desc',
  totalSpent: 'desc',
  loyaltyLevel: 'desc',
  createdAt: 'desc',
};

export function getDefaultUserSortOrder(field: UserSortField): UserSortOrder {
  return USER_SORT_DEFAULT_ORDERS[field];
}

export function isUserSortField(value: unknown): value is UserSortField {
  return typeof value === 'string' && USER_SORT_FIELDS.includes(value as UserSortField);
}

export function normalizeUserSortField(value: unknown): UserSortField {
  return isUserSortField(value) ? value : DEFAULT_USER_SORT_FIELD;
}

export function normalizeUserSortOrder(value: unknown, field: UserSortField): UserSortOrder {
  if (value === 'asc' || value === 'desc') return value;

  return getDefaultUserSortOrder(field);
}
