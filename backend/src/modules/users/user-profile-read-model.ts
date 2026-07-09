import { Prisma } from '@prisma/client';

/**
 * User-facing self-profile read model.
 *
 * Единственный owner формы ответа для user-facing users endpoints
 * (`GET /users/:id`, bot `find-or-create`, `PATCH /users/me/email`).
 *
 * Это whitelist-проекция под клиентский контракт `User`: в ответ попадают
 * только явно перечисленные поля, поэтому legacy identity slot
 * (`authProvider`/`providerId`) и чужие связанные записи (`referredBy`,
 * `referrals`) сюда структурно попасть не могут. Blacklist-scrub через
 * `delete` больше не нужен.
 *
 * Денежные значения отдаются как `number` (Decimal→Number), telegramId как
 * строка — совпадает с уже существующим контрактом `/auth/me` и клиентским
 * типом `User`. Admin surface использует отдельный owner
 * (`admin-user-read-model.ts`) со своим string-контрактом.
 */

export const USER_PROFILE_LOYALTY_SELECT = {
  id: true,
  name: true,
  minSpent: true,
  cashbackPercent: true,
  discount: true,
} satisfies Prisma.LoyaltyLevelSelect;

export const USER_PROFILE_SELECT = {
  id: true,
  telegramId: true,
  username: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  balance: true,
  bonusBalance: true,
  referralCode: true,
  referredById: true,
  referralLinkId: true,
  totalSpent: true,
  loyaltyLevel: { select: USER_PROFILE_LOYALTY_SELECT },
} satisfies Prisma.UserSelect;

type LoyaltyLevelProfileSource = {
  id: string;
  name: string;
  minSpent: Prisma.Decimal;
  cashbackPercent: Prisma.Decimal;
  discount: Prisma.Decimal;
};

/**
 * Источник описан структурно, а не через `Prisma.UserGetPayload`, чтобы один
 * mapper обслуживал и `select`-проекцию (`findById`), и `include`-результаты
 * resolver-а/`update`, где те же поля присутствуют как superset.
 */
export type UserProfileSource = {
  id: string;
  telegramId: bigint | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  balance: Prisma.Decimal;
  bonusBalance: Prisma.Decimal;
  referralCode: string;
  referredById: string | null;
  referralLinkId: string | null;
  totalSpent: Prisma.Decimal;
  loyaltyLevel?: LoyaltyLevelProfileSource | null;
};

export type UserProfileLoyaltyLevel = {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discount: number;
};

export type UserProfileReadModel = {
  id: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  balance: number;
  bonusBalance: number;
  referralCode: string;
  referredById: string | null;
  referralLinkId: string | null;
  totalSpent: number;
  loyaltyLevel: UserProfileLoyaltyLevel | null;
};

function toLoyaltyLevel(
  loyaltyLevel: LoyaltyLevelProfileSource | null | undefined,
): UserProfileLoyaltyLevel | null {
  if (!loyaltyLevel) return null;

  return {
    id: loyaltyLevel.id,
    name: loyaltyLevel.name,
    minSpent: Number(loyaltyLevel.minSpent),
    cashbackPercent: Number(loyaltyLevel.cashbackPercent),
    discount: Number(loyaltyLevel.discount),
  };
}

export function toUserProfileReadModel(
  user: UserProfileSource,
): UserProfileReadModel {
  return {
    id: user.id,
    telegramId: user.telegramId === null ? null : user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    email: user.email,
    balance: Number(user.balance),
    bonusBalance: Number(user.bonusBalance),
    referralCode: user.referralCode,
    referredById: user.referredById,
    referralLinkId: user.referralLinkId,
    totalSpent: Number(user.totalSpent),
    loyaltyLevel: toLoyaltyLevel(user.loyaltyLevel),
  };
}
