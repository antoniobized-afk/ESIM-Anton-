import { AuthIdentityProvider } from '@prisma/client';
import { IssueSeverity, UserIdentityBackfillIssue } from './user-identity-backfill.types';
import { AUTH_IDENTITY_PROVIDERS } from '../identity/auth-identity-normalizer';

export {
  identityKey,
  LEGACY_PROVIDER_MAP,
  normalizeEmail,
  normalizeProviderSubject,
} from '../identity/auth-identity-normalizer';

export function emptyProviderCounts(): Record<AuthIdentityProvider, number> {
  return Object.fromEntries(AUTH_IDENTITY_PROVIDERS.map((provider) => [provider, 0])) as Record<
    AuthIdentityProvider,
    number
  >;
}

export function countIssues(
  issues: UserIdentityBackfillIssue[],
): Record<IssueSeverity, number> {
  return issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { error: 0, warning: 0, info: 0 },
  );
}
