import { Injectable } from '@nestjs/common';
import {
  Prisma,
  UserIdentityAuditActorType,
  UserIdentityAuditEvent,
} from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  MergePreflightActor,
  MergePreflightAuditReport,
} from './user-merge-preflight.types';

@Injectable()
export class UserMergePreflightAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    report: MergePreflightAuditReport,
    actor?: MergePreflightActor,
  ): Promise<void> {
    const sourceMetadata = this.auditMetadata(report, 'source');
    const targetMetadata = this.auditMetadata(report, 'target');
    const actorType = this.auditActorType(actor);

    await Promise.all([
      this.prisma.userIdentityAudit.create({
        data: {
          event: UserIdentityAuditEvent.MERGE_PREFLIGHT,
          userId: report.sourceUserId,
          actorType,
          actorId: actor?.id,
          reason: 'admin_merge_preflight_read_only',
          metadata: sourceMetadata as Prisma.InputJsonValue,
        },
      }),
      this.prisma.userIdentityAudit.create({
        data: {
          event: UserIdentityAuditEvent.MERGE_PREFLIGHT,
          userId: report.targetUserId,
          actorType,
          actorId: actor?.id,
          reason: 'admin_merge_preflight_read_only',
          metadata: targetMetadata as Prisma.InputJsonValue,
        },
      }),
    ]);
  }

  private auditMetadata(
    report: MergePreflightAuditReport,
    roleInPreflight: 'source' | 'target',
  ): Record<string, unknown> {
    const blockingConflictCodes = report.conflicts
      .filter((conflict) => conflict.severity === 'blocking')
      .map((conflict) => conflict.code);

    return {
      phase: 'phase18',
      source: 'user_merge_preflight_read_only',
      roleInPreflight,
      sourceUserId: report.sourceUserId,
      targetUserId: report.targetUserId,
      counterpartyUserId:
        roleInPreflight === 'source' ? report.targetUserId : report.sourceUserId,
      canMerge: report.canMerge,
      mutationEnabled: report.mutationEnabled,
      conflictCodes: report.conflicts.map((conflict) => conflict.code),
      blockingConflictCodes,
      assetCounts: report.assets,
      rawIdentitySubjectsStored: false,
      businessRowsMutated: false,
    };
  }

  private auditActorType(actor?: MergePreflightActor): UserIdentityAuditActorType {
    if (actor?.role === 'SUPPORT') return UserIdentityAuditActorType.SUPPORT;
    return UserIdentityAuditActorType.ADMIN;
  }
}
