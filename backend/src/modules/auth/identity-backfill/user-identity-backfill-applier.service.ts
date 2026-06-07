import { Injectable } from '@nestjs/common';
import { Prisma, UserIdentityAuditActorType, UserIdentityAuditEvent } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  IdentityCandidate,
  UserIdentityBackfillApplyResult,
} from './user-identity-backfill.types';
import { auditSnapshot, identityMetadata, subjectHash, subjectPreview } from './user-identity-privacy';

@Injectable()
export class UserIdentityBackfillApplier {
  constructor(private readonly prisma: PrismaService) {}

  async apply(candidates: IdentityCandidate[]): Promise<UserIdentityBackfillApplyResult> {
    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      let skipped = 0;

      for (const candidate of candidates) {
        const result = await this.applyCandidate(tx, candidate);
        created += result.created;
        skipped += result.skipped;
      }

      return { created, skipped };
    });
  }

  private async applyCandidate(
    tx: Prisma.TransactionClient,
    candidate: IdentityCandidate,
  ): Promise<UserIdentityBackfillApplyResult> {
    const existing = await tx.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: candidate.provider,
          providerSubject: candidate.providerSubject,
        },
      },
      select: { id: true, userId: true },
    });

    if (existing) {
      this.assertExistingIdentityOwner(existing.userId, candidate);
      return { created: 0, skipped: 1 };
    }

    const identity = await tx.userIdentity.create({
      data: {
        userId: candidate.userId,
        provider: candidate.provider,
        providerSubject: candidate.providerSubject,
        email: candidate.email,
        emailVerified: candidate.emailVerified,
        displayName: candidate.displayName,
        metadata: identityMetadata(candidate) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await tx.userIdentityAudit.create({
      data: {
        event: UserIdentityAuditEvent.BACKFILLED,
        identityId: identity.id,
        userId: candidate.userId,
        actorType: UserIdentityAuditActorType.SYSTEM,
        provider: candidate.provider,
        providerSubjectHash: subjectHash(candidate.providerSubject),
        providerSubjectPreview: subjectPreview(candidate.provider, candidate.providerSubject),
        reason: 'phase18_step2_backfill',
        after: auditSnapshot(candidate) as Prisma.InputJsonValue,
        metadata: identityMetadata(candidate) as Prisma.InputJsonValue,
      },
    });

    return { created: 1, skipped: 0 };
  }

  private assertExistingIdentityOwner(
    existingUserId: string,
    candidate: IdentityCandidate,
  ): void {
    if (existingUserId === candidate.userId) return;

    throw new Error(
      `Preflight became stale: identity ${candidate.provider}:${subjectPreview(
        candidate.provider,
        candidate.providerSubject,
      )} already belongs to another user`,
    );
  }
}
