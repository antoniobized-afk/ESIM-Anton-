import { AuthIdentityProvider, Prisma } from '@prisma/client';

export type MergeUserSnapshot = {
  id: string;
  email: string | null;
  telegramId: bigint | null;
  authProvider: string | null;
  providerId: string | null;
  balance: Prisma.Decimal;
  bonusBalance: Prisma.Decimal;
  totalSpent: Prisma.Decimal;
  loyaltyLevelId: string | null;
  isBlocked: boolean;
};

export type MergeIdentitySnapshot = {
  id: string;
  userId: string;
  provider: AuthIdentityProvider;
  providerSubject: string;
  email: string | null;
};

export type MergeIdentityView = {
  id: string;
  userId: string;
  provider: AuthIdentityProvider;
  providerSubjectHash: string;
  providerSubjectPreview: string;
  emailPreview: string | null;
};

export type MergeConflict = {
  code: string;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  userId?: string;
  details?: Record<string, unknown>;
};

export type MergeAssetCounts = Record<string, Record<string, number>>;

export type MergePreflightActor = {
  id: string;
  role?: string | null;
};

export type MergePreflightAuditReport = {
  sourceUserId: string;
  targetUserId: string;
  assets: MergeAssetCounts;
  conflicts: MergeConflict[];
  canMerge: boolean;
  mutationEnabled: boolean;
};
