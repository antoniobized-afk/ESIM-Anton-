import { AuthIdentityProvider } from '@prisma/client';

export type IssueSeverity = 'error' | 'warning' | 'info';

export type LegacyUserRecord = {
  id: string;
  telegramId: bigint | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  authProvider: string | null;
  providerId: string | null;
};

export type ExistingIdentityRecord = {
  id: string;
  userId: string;
  provider: AuthIdentityProvider;
  providerSubject: string;
};

export type IdentityCandidateSource =
  | 'user.email'
  | 'user.telegramId'
  | 'users.authProvider/providerId';

export type IdentityCandidate = {
  userId: string;
  provider: AuthIdentityProvider;
  providerSubject: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  source: IdentityCandidateSource;
};

export type UserIdentityBackfillIssue = {
  code:
    | 'DUPLICATE_NORMALIZED_EMAIL'
    | 'DUPLICATE_IDENTITY_SUBJECT'
    | 'DUPLICATE_PROVIDER_FOR_USER'
    | 'EXISTING_PROVIDER_FOR_USER_CONFLICT'
    | 'LEGACY_PROVIDER_INCOMPLETE'
    | 'LEGACY_PROVIDER_UNKNOWN'
    | 'EMAIL_PROVIDER_SUBJECT_MISMATCH'
    | 'TELEGRAM_PROVIDER_SUBJECT_MISMATCH'
    | 'EXISTING_IDENTITY_CONFLICT'
    | 'BOT_ONLY_TELEGRAM_USER';
  severity: IssueSeverity;
  message: string;
  userIds?: string[];
  userId?: string;
  provider?: AuthIdentityProvider;
  providerSubjectHash?: string;
  providerSubjectPreview?: string;
  details?: Record<string, unknown>;
};

export type UserIdentityPreflightReport = {
  ok: boolean;
  checkedUsers: number;
  existingIdentities: number;
  plannedIdentities: number;
  plannedByProvider: Record<AuthIdentityProvider, number>;
  issueCounts: Record<IssueSeverity, number>;
  issues: UserIdentityBackfillIssue[];
};

export type InternalUserIdentityPreflight = UserIdentityPreflightReport & {
  candidates: IdentityCandidate[];
};

export type UserIdentityBackfillResult = {
  dryRun: boolean;
  applied: boolean;
  reason: 'dry_run' | 'applied' | 'preflight_failed';
  created: number;
  skipped: number;
  report: UserIdentityPreflightReport;
};

export type UserIdentityBackfillApplyResult = {
  created: number;
  skipped: number;
};
