import { AuthIdentityProvider, Prisma } from '@prisma/client';
import { getAuthIdentityProviderLabel } from '../auth/identity/auth-identity-provider-labels';

export const ADMIN_USER_READ_MODEL_INCLUDE = {
  loyaltyLevel: true,
  identities: {
    select: {
      id: true,
      provider: true,
      email: true,
      emailVerified: true,
      displayName: true,
      linkedAt: true,
      lastLoginAt: true,
    },
    orderBy: [{ provider: 'asc' }, { linkedAt: 'asc' }],
  },
  referredBy: {
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  referralLink: {
    select: {
      id: true,
      code: true,
      label: true,
    },
  },
} satisfies Prisma.UserInclude;

export type AdminUserReadModelSource = Prisma.UserGetPayload<{
  include: typeof ADMIN_USER_READ_MODEL_INCLUDE;
}>;

export type AdminUserIdentityProviderReadModel = {
  id: string;
  provider: AuthIdentityProvider;
  label: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  linkedAt: string;
  lastLoginAt: string | null;
};

export type AdminUserAttributionBucket =
  | {
      kind: 'referral';
      label: string;
      referredById: string | null;
      referralLinkId: string | null;
      referralLinkCode: string | null;
      referralLinkLabel: string | null;
      referrer: AdminUserCompactReference | null;
    }
  | {
      kind: 'utm';
      label: string;
      source: string | null;
      medium: string | null;
      campaign: string | null;
    }
  | {
      kind: 'entryChannel';
      label: string;
      channel: 'telegram' | 'direct';
    }
  | {
      kind: 'unknown';
      label: string;
    };

export type AdminUserAttributionSummaryReadModel = {
  buckets: AdminUserAttributionBucket[];
};

export type AdminUserCompactReference = {
  id: string;
  displayName: string;
  username: string | null;
  email: string | null;
};

export type AdminUserLoyaltyLevelReadModel = {
  id: string;
  name: string;
  minSpent: string;
  cashbackPercent: string;
  discount: string;
};

export type AdminUserListItemReadModel = {
  id: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  referralCode: string;
  balance: string;
  bonusBalance: string;
  totalSpent: string;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
  loyaltyLevel: AdminUserLoyaltyLevelReadModel | null;
  identityProviders: AdminUserIdentityProviderReadModel[];
  attributionSummary: AdminUserAttributionSummaryReadModel;
};

export type AdminUserDetailReadModel = AdminUserListItemReadModel;

function decimalToString(value: Prisma.Decimal): string {
  return value.toString();
}

function dateToIso(value: Date): string {
  return value.toISOString();
}

function compactReference(
  user: AdminUserReadModelSource['referredBy'],
): AdminUserCompactReference | null {
  if (!user) return null;

  const fullName = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    id: user.id,
    displayName: fullName || user.username || user.email || user.id,
    username: user.username,
    email: user.email,
  };
}

function toIdentityProviderReadModel(
  identity: AdminUserReadModelSource['identities'][number],
): AdminUserIdentityProviderReadModel {
  return {
    id: identity.id,
    provider: identity.provider,
    label: getAuthIdentityProviderLabel(identity.provider),
    email: identity.email,
    emailVerified: identity.emailVerified,
    displayName: identity.displayName,
    linkedAt: dateToIso(identity.linkedAt),
    lastLoginAt: identity.lastLoginAt ? dateToIso(identity.lastLoginAt) : null,
  };
}

function toLoyaltyLevelReadModel(
  loyaltyLevel: AdminUserReadModelSource['loyaltyLevel'],
): AdminUserLoyaltyLevelReadModel | null {
  if (!loyaltyLevel) return null;

  return {
    id: loyaltyLevel.id,
    name: loyaltyLevel.name,
    minSpent: decimalToString(loyaltyLevel.minSpent),
    cashbackPercent: decimalToString(loyaltyLevel.cashbackPercent),
    discount: decimalToString(loyaltyLevel.discount),
  };
}

function hasUtm(user: AdminUserReadModelSource): boolean {
  return Boolean(user.utmSource || user.utmMedium || user.utmCampaign);
}

function hasReferral(user: AdminUserReadModelSource): boolean {
  return Boolean(user.referredById || user.referralLinkId);
}

function resolveEntryChannel(
  user: AdminUserReadModelSource,
): AdminUserAttributionBucket | null {
  const hasTelegramIdentity = user.identities.some(
    (identity) => identity.provider === AuthIdentityProvider.TELEGRAM,
  );
  if (user.telegramId !== null || hasTelegramIdentity) {
    return { kind: 'entryChannel', label: 'Telegram', channel: 'telegram' };
  }

  if (
    user.email ||
    user.phone ||
    user.username ||
    user.identities.length > 0
  ) {
    return { kind: 'entryChannel', label: 'Прямой вход', channel: 'direct' };
  }

  return null;
}

function buildAttributionSummary(
  user: AdminUserReadModelSource,
): AdminUserAttributionSummaryReadModel {
  const buckets: AdminUserAttributionBucket[] = [];

  if (hasReferral(user)) {
    buckets.push({
      kind: 'referral',
      label: 'Реферал',
      referredById: user.referredById,
      referralLinkId: user.referralLinkId,
      referralLinkCode: user.referralLink?.code ?? null,
      referralLinkLabel: user.referralLink?.label ?? null,
      referrer: compactReference(user.referredBy),
    });
  }

  if (hasUtm(user)) {
    buckets.push({
      kind: 'utm',
      label: 'UTM',
      source: user.utmSource,
      medium: user.utmMedium,
      campaign: user.utmCampaign,
    });
  }

  if (buckets.length === 0) {
    const entryChannel = resolveEntryChannel(user);
    buckets.push(entryChannel ?? { kind: 'unknown', label: 'Неизвестно' });
  }

  return { buckets };
}

export function toAdminUserListItemReadModel(
  user: AdminUserReadModelSource,
): AdminUserListItemReadModel {
  return {
    id: user.id,
    telegramId: user.telegramId === null ? null : user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    email: user.email,
    referralCode: user.referralCode,
    balance: decimalToString(user.balance),
    bonusBalance: decimalToString(user.bonusBalance),
    totalSpent: decimalToString(user.totalSpent),
    isBlocked: user.isBlocked,
    createdAt: dateToIso(user.createdAt),
    updatedAt: dateToIso(user.updatedAt),
    loyaltyLevel: toLoyaltyLevelReadModel(user.loyaltyLevel),
    identityProviders: user.identities.map(toIdentityProviderReadModel),
    attributionSummary: buildAttributionSummary(user),
  };
}

export function toAdminUserDetailReadModel(
  user: AdminUserReadModelSource,
): AdminUserDetailReadModel {
  return toAdminUserListItemReadModel(user);
}
