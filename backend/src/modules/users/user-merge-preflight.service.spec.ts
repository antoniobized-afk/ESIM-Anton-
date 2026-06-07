import { BadRequestException } from '@nestjs/common';
import {
  AuthIdentityProvider,
  Prisma,
  UserIdentityAuditActorType,
  UserIdentityAuditEvent,
} from '@prisma/client';
import { UserMergePreflightAssetsService } from './user-merge-preflight-assets.service';
import { UserMergePreflightAuditService } from './user-merge-preflight-audit.service';
import { UserMergePreflightService } from './user-merge-preflight.service';

function makeService() {
  const countZero = jest.fn().mockResolvedValue(0);
  const prisma = {
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userIdentity: {
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    userIdentityAudit: {
      create: jest.fn(),
    },
    order: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
    transaction: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
    cloudPaymentsCardToken: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
    referralLink: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
    promoCode: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
    promoCodeRedemption: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
    pushSubscription: { count: countZero, updateMany: jest.fn() },
    notification: { count: countZero, updateMany: jest.fn() },
  };

  prisma.user.findMany.mockResolvedValue([
    {
      id: 'source_1',
      email: 'User@Example.com',
      telegramId: 111n,
      authProvider: 'telegram',
      providerId: '111',
      balance: new Prisma.Decimal(100),
      bonusBalance: new Prisma.Decimal(50),
      totalSpent: new Prisma.Decimal(1000),
      loyaltyLevelId: 'level_1',
      isBlocked: false,
    },
    {
      id: 'target_1',
      email: ' user@example.com ',
      telegramId: 222n,
      authProvider: 'google',
      providerId: 'google_2',
      balance: new Prisma.Decimal(200),
      bonusBalance: new Prisma.Decimal(25),
      totalSpent: new Prisma.Decimal(2000),
      loyaltyLevelId: 'level_2',
      isBlocked: false,
    },
  ]);
  prisma.userIdentity.findMany.mockResolvedValue([
    {
      id: 'identity_source_tg',
      userId: 'source_1',
      provider: AuthIdentityProvider.TELEGRAM,
      providerSubject: '999',
      email: null,
    },
    {
      id: 'identity_target_google',
      userId: 'target_1',
      provider: AuthIdentityProvider.GOOGLE,
      providerSubject: 'google_2',
      email: 'user@example.com',
    },
  ]);

  const assetsService = new UserMergePreflightAssetsService(prisma as any);
  const auditService = new UserMergePreflightAuditService(prisma as any);
  return {
    prisma,
    service: new UserMergePreflightService(
      prisma as any,
      assetsService,
      auditService,
    ),
  };
}

describe('UserMergePreflightService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('отклоняет preflight для одного и того же user', async () => {
    const { service } = makeService();

    await expect(service.preflight('user_1', 'user_1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('возвращает read-only report по assets/conflicts без business mutation writes', async () => {
    const { service, prisma } = makeService();
    prisma.cloudPaymentsCardToken.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.userId === 'source_1' ? 1 : 0),
    );
    prisma.referralLink.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.userId === 'source_1' ? 1 : 0),
    );
    prisma.promoCode.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.referralOwnerId === 'source_1' ? 1 : 0),
    );

    const result = await service.preflight(
      'source_1',
      'target_1',
      { id: 'support_1', role: 'SUPPORT' },
    );

    expect(result).toMatchObject({
      mode: 'read_only_preflight',
      sourceUserId: 'source_1',
      targetUserId: 'target_1',
      canMerge: false,
      mutationEnabled: false,
    });
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'BOTH_USERS_HAVE_BALANCE' }),
        expect.objectContaining({ code: 'DUPLICATE_NORMALIZED_EMAIL' }),
        expect.objectContaining({ code: 'TELEGRAM_IDENTITY_CONTACT_DRIFT' }),
        expect.objectContaining({ code: 'SAVED_CARDS_PRESENT' }),
        expect.objectContaining({ code: 'REFERRAL_LINK_OWNER_PRESENT' }),
        expect.objectContaining({ code: 'PROMO_OWNER_PRESENT' }),
      ]),
    );
    expect(result.assets.savedCards.source_1).toBe(1);
    expect(result.identities.source).toEqual([
      expect.objectContaining({
        id: 'identity_source_tg',
        provider: AuthIdentityProvider.TELEGRAM,
        providerSubjectHash: expect.any(String),
        providerSubjectPreview: '9***9',
        emailPreview: null,
      }),
    ]);
    expect(result.identities.target).toEqual([
      expect.objectContaining({
        id: 'identity_target_google',
        provider: AuthIdentityProvider.GOOGLE,
        providerSubjectHash: expect.any(String),
        providerSubjectPreview: 'goo..._2',
        emailPreview: 'us***@example.com',
      }),
    ]);
    expect(JSON.stringify(result.identities)).not.toContain('google_2');
    expect(JSON.stringify(result.identities)).not.toContain('999');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.userIdentity.update).not.toHaveBeenCalled();
    expect(prisma.userIdentity.delete).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    expect(prisma.cloudPaymentsCardToken.updateMany).not.toHaveBeenCalled();
  });

  it('пишет MERGE_PREFLIGHT audit для source и target без raw identity subject', async () => {
    const { service, prisma } = makeService();

    await service.preflight(
      'source_1',
      'target_1',
      { id: 'admin_1', role: 'SUPER_ADMIN' },
    );

    expect(prisma.userIdentityAudit.create).toHaveBeenCalledTimes(2);
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.MERGE_PREFLIGHT,
        userId: 'source_1',
        actorType: UserIdentityAuditActorType.ADMIN,
        actorId: 'admin_1',
        reason: 'admin_merge_preflight_read_only',
        metadata: expect.objectContaining({
          source: 'user_merge_preflight_read_only',
          roleInPreflight: 'source',
          sourceUserId: 'source_1',
          targetUserId: 'target_1',
          counterpartyUserId: 'target_1',
          mutationEnabled: false,
          businessRowsMutated: false,
          rawIdentitySubjectsStored: false,
          conflictCodes: expect.arrayContaining([
            'DUPLICATE_NORMALIZED_EMAIL',
            'TELEGRAM_IDENTITY_CONTACT_DRIFT',
          ]),
          assetCounts: expect.any(Object),
        }),
      }),
    });
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.MERGE_PREFLIGHT,
        userId: 'target_1',
        actorType: UserIdentityAuditActorType.ADMIN,
        actorId: 'admin_1',
        metadata: expect.objectContaining({
          roleInPreflight: 'target',
          counterpartyUserId: 'source_1',
        }),
      }),
    });
    expect(
      JSON.stringify(prisma.userIdentityAudit.create.mock.calls),
    ).not.toContain('google_2');
    expect(
      JSON.stringify(prisma.userIdentityAudit.create.mock.calls),
    ).not.toContain('999');
  });
});
