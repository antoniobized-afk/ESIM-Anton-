import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserAdminDeletionService } from './user-admin-deletion.service';

const baseUser = {
  id: 'user_1',
  balance: new Prisma.Decimal(0),
  bonusBalance: new Prisma.Decimal(0),
  totalSpent: new Prisma.Decimal(0),
  referredById: null,
  referralLinkId: null,
  _count: {
    orders: 0,
    repeatChargeAttempts: 0,
    transactions: 0,
    cloudPaymentsCardTokens: 0,
    referralLinks: 0,
    referrals: 0,
    ownedPromoCodes: 0,
    promoCodeRedemptions: 0,
    promoRewardSnapshots: 0,
  },
};

function makeService(user = baseUser) {
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback: any) => callback(prisma)),
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      delete: jest.fn().mockResolvedValue({ id: 'user_1' }),
    },
    userIdentity: {
      findMany: jest.fn().mockResolvedValue([{ id: 'identity_1' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    userIdentityAudit: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    pushSubscription: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    notification: {
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  };

  return {
    prisma,
    service: new UserAdminDeletionService(prisma as any),
  };
}

describe('UserAdminDeletionService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('блокирует удаление пользователя с бизнес-данными', async () => {
    const { service, prisma } = makeService({
      ...baseUser,
      balance: new Prisma.Decimal(100),
      _count: {
        ...baseUser._count,
        orders: 1,
      },
    });

    await expect(service.deleteUser('user_1')).rejects.toThrow(ConflictException);

    expect(prisma.userIdentityAudit.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('блокирует удаление пользователя с реферальной атрибуцией', async () => {
    const { service, prisma } = makeService({
      ...baseUser,
      referralLinkId: 'link_1',
    });

    await expect(service.deleteUser('user_1')).rejects.toThrow(ConflictException);

    expect(prisma.userIdentityAudit.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('удаляет пустого пользователя и его хвосты', async () => {
    const { service, prisma } = makeService();

    const result = await service.deleteUser('user_1');

    expect(prisma.userIdentity.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.userIdentityAudit.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: 'user_1' },
          { identityId: { in: ['identity_1'] } },
        ],
      },
    });
    expect(prisma.userIdentity.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user_1' } });
    expect(result).toEqual({
      success: true,
      deletedUserId: 'user_1',
      deletedIdentityCount: 1,
      deletedIdentityAuditCount: 2,
      deletedPushSubscriptionCount: 1,
      deletedNotificationCount: 3,
    });
  });

  it('возвращает NotFoundException, если пользователь не найден', async () => {
    const { service, prisma } = makeService(null as any);

    await expect(service.deleteUser('missing')).rejects.toThrow(NotFoundException);

    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
