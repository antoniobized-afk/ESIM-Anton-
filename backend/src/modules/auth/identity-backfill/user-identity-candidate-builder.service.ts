import { Injectable } from '@nestjs/common';
import { AuthIdentityProvider } from '@prisma/client';
import {
  IdentityCandidate,
  LegacyUserRecord,
  UserIdentityBackfillIssue,
} from './user-identity-backfill.types';
import {
  identityKey,
  LEGACY_PROVIDER_MAP,
  normalizeEmail,
  normalizeProviderSubject,
} from './user-identity-normalizer';
import { subjectHash, subjectPreview } from './user-identity-privacy';

@Injectable()
export class UserIdentityCandidateBuilder {
  buildForUser(user: LegacyUserRecord): {
    candidates: IdentityCandidate[];
    issues: UserIdentityBackfillIssue[];
  } {
    const issues: UserIdentityBackfillIssue[] = [];
    const candidates = [
      ...this.telegramCandidates(user, issues),
      ...this.legacyProviderCandidates(user, issues),
      ...this.emailCandidates(user),
    ];

    return {
      candidates: this.dedupeCandidates(candidates),
      issues,
    };
  }

  private telegramCandidates(
    user: LegacyUserRecord,
    issues: UserIdentityBackfillIssue[],
  ): IdentityCandidate[] {
    if (user.telegramId === null) return [];

    const providerSubject = user.telegramId.toString();

    if (!user.authProvider && !user.providerId) {
      issues.push({
        code: 'BOT_ONLY_TELEGRAM_USER',
        severity: 'info',
        userId: user.id,
        provider: AuthIdentityProvider.TELEGRAM,
        providerSubjectHash: subjectHash(providerSubject),
        providerSubjectPreview: subjectPreview(AuthIdentityProvider.TELEGRAM, providerSubject),
        message: 'Bot-only Telegram user will receive a Telegram identity from users.telegramId.',
      });
    }

    return [
      {
        userId: user.id,
        provider: AuthIdentityProvider.TELEGRAM,
        providerSubject,
        displayName: this.displayName(user),
        email: normalizeEmail(user.email) ?? undefined,
        emailVerified: false,
        source: 'user.telegramId',
      },
    ];
  }

  private legacyProviderCandidates(
    user: LegacyUserRecord,
    issues: UserIdentityBackfillIssue[],
  ): IdentityCandidate[] {
    const legacyProvider = user.authProvider?.trim().toLowerCase() || null;
    const legacyProviderId = user.providerId?.trim() || null;

    if ((legacyProvider && !legacyProviderId) || (!legacyProvider && legacyProviderId)) {
      issues.push(this.incompleteProviderIssue(user, legacyProvider, legacyProviderId));
      return [];
    }

    if (!legacyProvider || !legacyProviderId) return [];

    const provider = LEGACY_PROVIDER_MAP[legacyProvider];
    if (!provider) {
      issues.push(this.unknownProviderIssue(user, legacyProvider));
      return [];
    }

    const providerSubject = normalizeProviderSubject(provider, legacyProviderId);
    issues.push(...this.providerSubjectMismatchIssues(user, provider, providerSubject));

    return [
      {
        userId: user.id,
        provider,
        providerSubject,
        displayName: this.displayName(user),
        email: this.legacyCandidateEmail(user, provider, legacyProviderId) ?? undefined,
        emailVerified:
          provider === AuthIdentityProvider.EMAIL &&
          Boolean(normalizeEmail(legacyProviderId)),
        source: 'users.authProvider/providerId',
      },
    ];
  }

  private emailCandidates(user: LegacyUserRecord): IdentityCandidate[] {
    const normalizedEmail = normalizeEmail(user.email);
    if (!normalizedEmail) return [];

    const legacyProvider = user.authProvider?.trim().toLowerCase() || null;
    const legacyProviderId = user.providerId?.trim() || null;

    return [
      {
        userId: user.id,
        provider: AuthIdentityProvider.EMAIL,
        providerSubject: normalizedEmail,
        email: normalizedEmail,
        emailVerified:
          legacyProvider === 'email' &&
          legacyProviderId !== null &&
          normalizeEmail(legacyProviderId) === normalizedEmail,
        displayName: this.displayName(user),
        source: 'user.email',
      },
    ];
  }

  private providerSubjectMismatchIssues(
    user: LegacyUserRecord,
    provider: AuthIdentityProvider,
    providerSubject: string,
  ): UserIdentityBackfillIssue[] {
    if (
      provider === AuthIdentityProvider.TELEGRAM &&
      user.telegramId !== null &&
      providerSubject !== user.telegramId.toString()
    ) {
      return [
        {
          code: 'TELEGRAM_PROVIDER_SUBJECT_MISMATCH',
          severity: 'error',
          userId: user.id,
          provider,
          providerSubjectHash: subjectHash(providerSubject),
          providerSubjectPreview: subjectPreview(provider, providerSubject),
          message: 'Legacy Telegram providerId does not match users.telegramId.',
          details: {
            telegramIdHash: subjectHash(user.telegramId.toString()),
            telegramIdPreview: subjectPreview(
              AuthIdentityProvider.TELEGRAM,
              user.telegramId.toString(),
            ),
          },
        },
      ];
    }

    const normalizedEmail = normalizeEmail(user.email);
    if (
      provider === AuthIdentityProvider.EMAIL &&
      normalizedEmail &&
      providerSubject !== normalizedEmail
    ) {
      return [
        {
          code: 'EMAIL_PROVIDER_SUBJECT_MISMATCH',
          severity: 'error',
          userId: user.id,
          provider,
          providerSubjectHash: subjectHash(providerSubject),
          providerSubjectPreview: subjectPreview(provider, providerSubject),
          message: 'Legacy email providerId does not match normalized users.email.',
          details: { emailPreview: subjectPreview(provider, normalizedEmail) },
        },
      ];
    }

    return [];
  }

  private legacyCandidateEmail(
    user: LegacyUserRecord,
    provider: AuthIdentityProvider,
    providerId: string,
  ): string | null {
    return provider === AuthIdentityProvider.EMAIL ? normalizeEmail(providerId) : normalizeEmail(user.email);
  }

  private incompleteProviderIssue(
    user: LegacyUserRecord,
    legacyProvider: string | null,
    legacyProviderId: string | null,
  ): UserIdentityBackfillIssue {
    return {
      code: 'LEGACY_PROVIDER_INCOMPLETE',
      severity: 'error',
      userId: user.id,
      message: 'Legacy authProvider/providerId pair is incomplete.',
      details: {
        authProviderPresent: Boolean(legacyProvider),
        providerIdPresent: Boolean(legacyProviderId),
      },
    };
  }

  private unknownProviderIssue(
    user: LegacyUserRecord,
    legacyProvider: string,
  ): UserIdentityBackfillIssue {
    return {
      code: 'LEGACY_PROVIDER_UNKNOWN',
      severity: 'error',
      userId: user.id,
      message: `Unknown legacy authProvider "${legacyProvider}".`,
      details: { authProvider: legacyProvider },
    };
  }

  private dedupeCandidates(candidates: IdentityCandidate[]): IdentityCandidate[] {
    const byKey = new Map<string, IdentityCandidate>();

    for (const candidate of candidates) {
      const key = identityKey(candidate.provider, candidate.providerSubject);
      const current = byKey.get(key);
      byKey.set(key, current ? this.mergeCandidates(current, candidate) : candidate);
    }

    return [...byKey.values()];
  }

  private mergeCandidates(
    current: IdentityCandidate,
    candidate: IdentityCandidate,
  ): IdentityCandidate {
    return {
      ...current,
      email: current.email ?? candidate.email,
      emailVerified: current.emailVerified || candidate.emailVerified,
      displayName: current.displayName ?? candidate.displayName,
    };
  }

  private displayName(user: LegacyUserRecord): string | undefined {
    const fullName = [user.firstName, user.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || user.username?.trim() || undefined;
  }
}
