import { AuthIdentityProvider } from '@prisma/client';
import { IdentityCandidate } from './user-identity-backfill.types';
import {
  subjectHash,
  subjectPreview,
  withoutUndefined,
} from '../identity/auth-identity-privacy';

export { subjectHash, subjectPreview } from '../identity/auth-identity-privacy';

export function identityMetadata(candidate: IdentityCandidate): Record<string, unknown> {
  return {
    source: candidate.source,
    phase: 'phase18',
    step: 'step-02-schema-migration-and-backfill',
  };
}

export function auditSnapshot(candidate: IdentityCandidate): Record<string, unknown> {
  return withoutUndefined({
    userId: candidate.userId,
    provider: candidate.provider,
    providerSubjectHash: subjectHash(candidate.providerSubject),
    providerSubjectPreview: subjectPreview(candidate.provider, candidate.providerSubject),
    emailHash: candidate.email ? subjectHash(candidate.email) : undefined,
    emailPreview: candidate.email
      ? subjectPreview(AuthIdentityProvider.EMAIL, candidate.email)
      : undefined,
    emailVerified: candidate.emailVerified,
    displayName: candidate.displayName,
    source: candidate.source,
  });
}
