import { Injectable } from '@nestjs/common';
import { AuthIdentityProvider } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { UserIdentityCandidateBuilder } from './user-identity-candidate-builder.service';
import {
  ExistingIdentityRecord,
  IdentityCandidate,
  InternalUserIdentityPreflight,
  LegacyUserRecord,
  UserIdentityBackfillIssue,
  UserIdentityPreflightReport,
} from './user-identity-backfill.types';
import {
  countIssues,
  emptyProviderCounts,
  identityKey,
  normalizeEmail,
} from './user-identity-normalizer';
import { subjectHash, subjectPreview } from './user-identity-privacy';

@Injectable()
export class UserIdentityPreflightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidateBuilder: UserIdentityCandidateBuilder,
  ) {}

  async build(): Promise<InternalUserIdentityPreflight> {
    const [users, existingIdentities] = await this.loadRuntimeState();
    const { candidates, issues } = this.buildCandidates(users);
    const pendingCandidates = this.findPendingCandidates(candidates, existingIdentities);
    const allIssues = [
      ...issues,
      ...this.findDuplicateEmails(users),
      ...this.findDuplicateIdentitySubjects(candidates),
      ...this.findDuplicateProvidersForUser(candidates),
      ...this.findExistingIdentityConflicts(candidates, existingIdentities),
      ...this.findExistingProviderConflicts(candidates, existingIdentities),
      ...this.findExistingProviderDuplicates(existingIdentities),
    ];
    const issueCounts = countIssues(allIssues);

    return {
      ok: issueCounts.error === 0,
      checkedUsers: users.length,
      existingIdentities: existingIdentities.length,
      plannedIdentities: pendingCandidates.length,
      plannedByProvider: this.plannedByProvider(pendingCandidates),
      issueCounts,
      issues: allIssues,
      candidates: pendingCandidates,
    };
  }

  toPublicReport(
    internal: InternalUserIdentityPreflight,
  ): UserIdentityPreflightReport {
    const { candidates: _candidates, ...report } = internal;
    return report;
  }

  private async loadRuntimeState(): Promise<[LegacyUserRecord[], ExistingIdentityRecord[]]> {
    return Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          authProvider: true,
          providerId: true,
        },
      }),
      this.prisma.userIdentity.findMany({
        select: {
          id: true,
          userId: true,
          provider: true,
          providerSubject: true,
        },
      }),
    ]);
  }

  private buildCandidates(users: LegacyUserRecord[]): {
    candidates: IdentityCandidate[];
    issues: UserIdentityBackfillIssue[];
  } {
    const candidates: IdentityCandidate[] = [];
    const issues: UserIdentityBackfillIssue[] = [];

    for (const user of users) {
      const result = this.candidateBuilder.buildForUser(user);
      candidates.push(...result.candidates);
      issues.push(...result.issues);
    }

    return { candidates, issues };
  }

  private findDuplicateEmails(users: LegacyUserRecord[]): UserIdentityBackfillIssue[] {
    const byEmail = new Map<string, string[]>();

    for (const user of users) {
      const normalizedEmail = normalizeEmail(user.email);
      if (!normalizedEmail) continue;
      byEmail.set(normalizedEmail, [...(byEmail.get(normalizedEmail) ?? []), user.id]);
    }

    return [...byEmail.entries()]
      .filter(([, userIds]) => new Set(userIds).size > 1)
      .map(([email, userIds]) => ({
        code: 'DUPLICATE_NORMALIZED_EMAIL',
        severity: 'error',
        userIds: [...new Set(userIds)],
        provider: AuthIdentityProvider.EMAIL,
        providerSubjectHash: subjectHash(email),
        providerSubjectPreview: subjectPreview(AuthIdentityProvider.EMAIL, email),
        message: 'Multiple users share the same normalized email.',
      }));
  }

  private findDuplicateIdentitySubjects(
    candidates: IdentityCandidate[],
  ): UserIdentityBackfillIssue[] {
    const bySubject = new Map<string, { candidate: IdentityCandidate; userIds: Set<string> }>();

    for (const candidate of candidates) {
      const key = identityKey(candidate.provider, candidate.providerSubject);
      const bucket = bySubject.get(key) ?? { candidate, userIds: new Set<string>() };
      bucket.userIds.add(candidate.userId);
      bySubject.set(key, bucket);
    }

    return [...bySubject.values()]
      .filter(({ userIds }) => userIds.size > 1)
      .map(({ candidate, userIds }) => ({
        code: 'DUPLICATE_IDENTITY_SUBJECT',
        severity: 'error',
        userIds: [...userIds],
        provider: candidate.provider,
        providerSubjectHash: subjectHash(candidate.providerSubject),
        providerSubjectPreview: subjectPreview(candidate.provider, candidate.providerSubject),
        message: 'Multiple users map to the same identity provider subject.',
      }));
  }

  private findDuplicateProvidersForUser(
    candidates: IdentityCandidate[],
  ): UserIdentityBackfillIssue[] {
    const byUserProvider = new Map<string, {
      userId: string;
      provider: AuthIdentityProvider;
      candidates: IdentityCandidate[];
    }>();

    for (const candidate of candidates) {
      const key = `${candidate.userId}:${candidate.provider}`;
      const bucket = byUserProvider.get(key) ?? {
        userId: candidate.userId,
        provider: candidate.provider,
        candidates: [],
      };
      bucket.candidates.push(candidate);
      byUserProvider.set(key, bucket);
    }

    return [...byUserProvider.values()]
      .filter(({ candidates: bucketCandidates }) => bucketCandidates.length > 1)
      .map(({ userId, provider, candidates: bucketCandidates }) => ({
        code: 'DUPLICATE_PROVIDER_FOR_USER',
        severity: 'error',
        userId,
        provider,
        userIds: [userId],
        message: 'One user maps to multiple provider subjects for the same provider.',
        details: {
          sources: bucketCandidates.map((candidate) => candidate.source),
          providerSubjectPreviews: bucketCandidates.map((candidate) =>
            subjectPreview(candidate.provider, candidate.providerSubject),
          ),
        },
      }));
  }

  private findExistingIdentityConflicts(
    candidates: IdentityCandidate[],
    existingIdentities: ExistingIdentityRecord[],
  ): UserIdentityBackfillIssue[] {
    const existingBySubject = new Map(
      existingIdentities.map((identity) => [
        identityKey(identity.provider, identity.providerSubject),
        identity,
      ]),
    );

    return candidates.flatMap((candidate) =>
      this.existingIdentityConflict(candidate, existingBySubject),
    );
  }

  private findExistingProviderConflicts(
    candidates: IdentityCandidate[],
    existingIdentities: ExistingIdentityRecord[],
  ): UserIdentityBackfillIssue[] {
    const existingByUserProvider = new Map(
      existingIdentities.map((identity) => [
        `${identity.userId}:${identity.provider}`,
        identity,
      ]),
    );

    return candidates.flatMap((candidate) => {
      const existing = existingByUserProvider.get(`${candidate.userId}:${candidate.provider}`);
      if (!existing || existing.providerSubject === candidate.providerSubject) return [];

      return [{
        code: 'EXISTING_PROVIDER_FOR_USER_CONFLICT',
        severity: 'error',
        userId: candidate.userId,
        provider: candidate.provider,
        providerSubjectHash: subjectHash(candidate.providerSubject),
        providerSubjectPreview: subjectPreview(candidate.provider, candidate.providerSubject),
        message: 'User already has another identity for the same provider.',
        details: {
          existingIdentityId: existing.id,
          existingProviderSubjectPreview: subjectPreview(
            existing.provider,
            existing.providerSubject,
          ),
        },
      }];
    });
  }

  private findExistingProviderDuplicates(
    existingIdentities: ExistingIdentityRecord[],
  ): UserIdentityBackfillIssue[] {
    const byUserProvider = new Map<string, ExistingIdentityRecord[]>();

    for (const identity of existingIdentities) {
      const key = `${identity.userId}:${identity.provider}`;
      byUserProvider.set(key, [...(byUserProvider.get(key) ?? []), identity]);
    }

    return [...byUserProvider.entries()].flatMap(([, identities]) => {
      const uniqueSubjects = new Set(identities.map((identity) => identity.providerSubject));
      if (identities.length <= 1 || uniqueSubjects.size <= 1) return [];
      const first = identities[0];

      return [{
        code: 'EXISTING_PROVIDER_FOR_USER_CONFLICT',
        severity: 'error',
        userId: first.userId,
        provider: first.provider,
        message: 'Existing UserIdentity rows contain multiple subjects for one user/provider.',
        details: {
          existingIdentityIds: identities.map((identity) => identity.id),
          providerSubjectPreviews: identities.map((identity) =>
            subjectPreview(identity.provider, identity.providerSubject),
          ),
        },
      }];
    });
  }

  private findPendingCandidates(
    candidates: IdentityCandidate[],
    existingIdentities: ExistingIdentityRecord[],
  ): IdentityCandidate[] {
    const existingBySubject = new Map(
      existingIdentities.map((identity) => [
        identityKey(identity.provider, identity.providerSubject),
        identity,
      ]),
    );

    return candidates.filter((candidate) => {
      const existing = existingBySubject.get(
        identityKey(candidate.provider, candidate.providerSubject),
      );

      return !existing || existing.userId !== candidate.userId;
    });
  }

  private existingIdentityConflict(
    candidate: IdentityCandidate,
    existingBySubject: Map<string, ExistingIdentityRecord>,
  ): UserIdentityBackfillIssue[] {
    const existing = existingBySubject.get(
      identityKey(candidate.provider, candidate.providerSubject),
    );

    if (!existing || existing.userId === candidate.userId) return [];

    return [
      {
        code: 'EXISTING_IDENTITY_CONFLICT',
        severity: 'error',
        userId: candidate.userId,
        userIds: [candidate.userId, existing.userId],
        provider: candidate.provider,
        providerSubjectHash: subjectHash(candidate.providerSubject),
        providerSubjectPreview: subjectPreview(candidate.provider, candidate.providerSubject),
        message: 'Existing UserIdentity belongs to another user.',
        details: { existingIdentityId: existing.id, existingUserId: existing.userId },
      },
    ];
  }

  private plannedByProvider(
    candidates: IdentityCandidate[],
  ): Record<AuthIdentityProvider, number> {
    const planned = emptyProviderCounts();
    for (const candidate of candidates) {
      planned[candidate.provider] += 1;
    }
    return planned;
  }
}
