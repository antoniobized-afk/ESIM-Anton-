import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthIdentityProvider } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { subjectHash, subjectPreview } from '@/modules/auth/identity/auth-identity-privacy';
import { UserMergePreflightAssetsService } from './user-merge-preflight-assets.service';
import { UserMergePreflightAuditService } from './user-merge-preflight-audit.service';
import {
  MergeAssetCounts,
  MergeConflict,
  MergeIdentitySnapshot,
  MergeIdentityView,
  MergePreflightActor,
  MergeUserSnapshot,
} from './user-merge-preflight.types';

@Injectable()
export class UserMergePreflightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetsService: UserMergePreflightAssetsService,
    private readonly auditService: UserMergePreflightAuditService,
  ) {}

  async preflight(
    sourceUserId: string,
    targetUserId: string,
    actor?: MergePreflightActor,
  ) {
    if (!sourceUserId || !targetUserId) {
      throw new BadRequestException('sourceUserId and targetUserId are required');
    }
    if (sourceUserId === targetUserId) {
      throw new BadRequestException('sourceUserId and targetUserId must differ');
    }

    const [users, identities, assets] = await Promise.all([
      this.loadUsers(sourceUserId, targetUserId),
      this.loadIdentities(sourceUserId, targetUserId),
      this.assetsService.load(sourceUserId, targetUserId),
    ]);

    const source = users.find((user) => user.id === sourceUserId);
    const target = users.find((user) => user.id === targetUserId);
    if (!source || !target) throw new NotFoundException('Source or target user not found');

    const conflicts = [
      ...this.balanceConflicts(source, target),
      ...this.identityConflicts(source, target, identities),
      ...this.assetConflicts(assets),
    ];

    const report = {
      mode: 'read_only_preflight',
      sourceUserId,
      targetUserId,
      users: {
        source: this.userSnapshot(source),
        target: this.userSnapshot(target),
      },
      assets,
      identities: {
        source: identities
          .filter((identity) => identity.userId === sourceUserId)
          .map((identity) => this.identityView(identity)),
        target: identities
          .filter((identity) => identity.userId === targetUserId)
          .map((identity) => this.identityView(identity)),
      },
      conflicts,
      canMerge: false,
      mutationEnabled: false,
      requiredPolicy:
        'Data-moving merge is disabled until per-relation conflict policy is approved.',
    };

    await this.auditService.record(report, actor);

    return report;
  }

  private async loadUsers(sourceUserId: string, targetUserId: string): Promise<MergeUserSnapshot[]> {
    return this.prisma.user.findMany({
      where: { id: { in: [sourceUserId, targetUserId] } },
      select: {
        id: true,
        email: true,
        telegramId: true,
        authProvider: true,
        providerId: true,
        balance: true,
        bonusBalance: true,
        totalSpent: true,
        loyaltyLevelId: true,
        isBlocked: true,
      },
    });
  }

  private async loadIdentities(
    sourceUserId: string,
    targetUserId: string,
  ): Promise<MergeIdentitySnapshot[]> {
    return this.prisma.userIdentity.findMany({
      where: { userId: { in: [sourceUserId, targetUserId] } },
      select: {
        id: true,
        userId: true,
        provider: true,
        providerSubject: true,
        email: true,
      },
    });
  }

  private balanceConflicts(
    source: MergeUserSnapshot,
    target: MergeUserSnapshot,
  ): MergeConflict[] {
    const conflicts: MergeConflict[] = [];

    if (Number(source.balance) > 0 && Number(target.balance) > 0) {
      conflicts.push({
        code: 'BOTH_USERS_HAVE_BALANCE',
        severity: 'blocking',
        message: 'Both users have positive balance; financial merge policy required.',
      });
    }

    if (Number(source.bonusBalance) > 0 && Number(target.bonusBalance) > 0) {
      conflicts.push({
        code: 'BOTH_USERS_HAVE_BONUS_BALANCE',
        severity: 'blocking',
        message: 'Both users have positive bonusBalance; ledger policy required.',
      });
    }

    return conflicts;
  }

  private identityConflicts(
    source: MergeUserSnapshot,
    target: MergeUserSnapshot,
    identities: MergeIdentitySnapshot[],
  ): MergeConflict[] {
    return [
      ...this.duplicateNormalizedEmailConflict(source, target),
      ...identities.flatMap((identity) =>
        this.telegramContactDriftConflict(identity, source, target),
      ),
      ...[source, target].flatMap((user) => this.legacyIdentityDrift(user, identities)),
    ];
  }

  private duplicateNormalizedEmailConflict(
    source: MergeUserSnapshot,
    target: MergeUserSnapshot,
  ): MergeConflict[] {
    const sourceEmail = source.email?.trim().toLowerCase();
    const targetEmail = target.email?.trim().toLowerCase();
    if (!sourceEmail || !targetEmail || sourceEmail !== targetEmail) return [];

    return [{
      code: 'DUPLICATE_NORMALIZED_EMAIL',
      severity: 'warning',
      message: 'Source and target users share the same normalized email.',
      details: {
        emailHash: subjectHash(sourceEmail),
        emailPreview: subjectPreview(AuthIdentityProvider.EMAIL, sourceEmail),
      },
    }];
  }

  private telegramContactDriftConflict(
    identity: MergeIdentitySnapshot,
    source: MergeUserSnapshot,
    target: MergeUserSnapshot,
  ): MergeConflict[] {
    if (identity.provider !== AuthIdentityProvider.TELEGRAM) return [];

    const user = identity.userId === source.id ? source : target;
    if (user.telegramId?.toString() === identity.providerSubject) return [];

    return [{
      code: 'TELEGRAM_IDENTITY_CONTACT_DRIFT',
      severity: 'blocking',
      userId: user.id,
      message: 'Telegram login identity differs from users.telegramId contact field.',
    }];
  }

  private legacyIdentityDrift(
    user: MergeUserSnapshot,
    identities: MergeIdentitySnapshot[],
  ): MergeConflict[] {
    if (!user.authProvider || !user.providerId) return [];

    const provider = user.authProvider.trim().toUpperCase() as AuthIdentityProvider;
    const matching = identities.find((identity) =>
      identity.userId === user.id &&
      identity.provider === provider &&
      identity.providerSubject === user.providerId,
    );
    if (matching) return [];

    return [{
      code: 'LEGACY_PROVIDER_IDENTITY_DRIFT',
      severity: 'warning',
      userId: user.id,
      message: 'Legacy authProvider/providerId does not match UserIdentity rows.',
      details: { authProvider: user.authProvider },
    }];
  }

  private assetConflicts(assets: MergeAssetCounts): MergeConflict[] {
    const conflicts: MergeConflict[] = [];

    if (Object.values(assets.savedCards).some((count) => count > 0)) {
      conflicts.push({
        code: 'SAVED_CARDS_PRESENT',
        severity: 'blocking',
        message: 'Saved cards require explicit CloudPayments AccountId policy.',
      });
    }

    if (Object.values(assets.referralLinks).some((count) => count > 0)) {
      conflicts.push({
        code: 'REFERRAL_LINK_OWNER_PRESENT',
        severity: 'blocking',
        message: 'Referral link ownership requires explicit policy.',
      });
    }

    if (Object.values(assets.ownedPromoCodes).some((count) => count > 0)) {
      conflicts.push({
        code: 'PROMO_OWNER_PRESENT',
        severity: 'blocking',
        message: 'Partner promo owner policy requires explicit policy.',
      });
    }

    return conflicts;
  }

  private userSnapshot(user: MergeUserSnapshot) {
    return {
      id: user.id,
      email: user.email,
      telegramId: user.telegramId?.toString() ?? null,
      balance: String(user.balance),
      bonusBalance: String(user.bonusBalance),
      totalSpent: String(user.totalSpent),
      loyaltyLevelId: user.loyaltyLevelId,
      isBlocked: user.isBlocked,
    };
  }

  private identityView(identity: MergeIdentitySnapshot): MergeIdentityView {
    return {
      id: identity.id,
      userId: identity.userId,
      provider: identity.provider,
      providerSubjectHash: subjectHash(identity.providerSubject),
      providerSubjectPreview: subjectPreview(
        identity.provider,
        identity.providerSubject,
      ),
      emailPreview: identity.email
        ? subjectPreview(AuthIdentityProvider.EMAIL, identity.email)
        : null,
    };
  }
}
