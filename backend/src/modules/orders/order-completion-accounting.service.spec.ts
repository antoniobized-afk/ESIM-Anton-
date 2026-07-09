import {
  CompletionAccountingStatus,
  OrderStatus,
  PromoCodeRedemptionSource,
  ReferralPayoutMode,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { OrderCompletionAccountingService } from './order-completion-accounting.service';

function makeAccountingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    userId: 'user_1',
    status: OrderStatus.COMPLETED,
    parentOrderId: null,
    totalAmount: 100,
    completionAccountingStatus: CompletionAccountingStatus.PENDING,
    completionAccountingAppliedAt: null,
    completionAccountingNextRetryAt: null,
    user: {
      totalSpent: 10000,
      referralLinkId: null,
      referredById: 'ref_1',
    },
    promoCodeRedemption: null,
    ...overrides,
  };
}

function makeService(orderOverrides: Record<string, unknown> = {}) {
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(makeAccountingOrder(orderOverrides)),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    referralLink: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    user: {
      update: jest.fn().mockResolvedValue(undefined),
    },
    transaction: {
      create: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn().mockImplementation(async (callback: any) =>
      callback({
        order: {
          updateMany: prisma.order.updateMany,
        },
        user: {
          update: prisma.user.update,
        },
        loyaltyLevel: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        transaction: {
          create: prisma.transaction.create,
        },
      }),
    ),
  };

  const systemSettingsService = {
    getReferralSettings: jest.fn().mockResolvedValue({
      bonusPercent: 5,
      minPayout: 500,
      enabled: true,
    }),
  };
  const referralsService = {
    awardReferralBonus: jest.fn().mockResolvedValue({ awarded: true, bonusAmount: 5 }),
  };
  const partnerRewardsService = {
    award: jest.fn().mockResolvedValue({ awarded: true, bonusAmount: 12.5 }),
  };
  const loyaltyService = {
    getEffectiveLevelForSpent: jest.fn().mockResolvedValue({
      id: 'silver',
      name: 'Серебро',
      minSpent: 10000,
      cashbackPercent: 10,
      discount: 0,
    }),
    updateUserLevel: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  const service = new OrderCompletionAccountingService(
    prisma as any,
    systemSettingsService as any,
    referralsService as any,
    partnerRewardsService as any,
    loyaltyService as any,
    configService as any,
  );

  return {
    service,
    prisma,
    systemSettingsService,
    referralsService,
    partnerRewardsService,
    loyaltyService,
    configService,
  };
}

describe('OrderCompletionAccountingService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('применяет cashback, totalSpent, referral reward и marker одним accounting boundary', async () => {
    const { service, prisma, referralsService, loyaltyService } = makeService();

    const result = await service.attemptPurchaseAccounting('order_1', { force: true });

    expect(result).toEqual({
      orderId: 'order_1',
      status: CompletionAccountingStatus.APPLIED,
      applied: true,
      reason: 'applied',
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'order_1',
          completionAccountingStatus: {
            in: [CompletionAccountingStatus.PENDING, CompletionAccountingStatus.FAILED],
          },
        }),
      }),
    );
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order_1',
        status: OrderStatus.COMPLETED,
        completionAccountingAppliedAt: null,
      },
      data: {
        completionAccountingAppliedAt: expect.any(Date),
      },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'user_1' },
      data: { bonusBalance: { increment: 10 } },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user_1' },
      data: { totalSpent: { increment: 100 } },
    });
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order_1',
        type: TransactionType.BONUS_ACCRUAL,
        status: TransactionStatus.SUCCEEDED,
      }),
    });
    expect(referralsService.awardReferralBonus).toHaveBeenCalledWith(
      'ref_1',
      100,
      'order_1',
      null,
      expect.anything(),
      expect.objectContaining({
        settings: expect.objectContaining({ enabled: true }),
        referralLink: null,
      }),
    );
    expect(loyaltyService.updateUserLevel).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({
        user: expect.objectContaining({
          update: expect.any(Function),
        }),
      }),
    );
  });

  it('при ошибке синхронизации loyalty level пишет FAILED для retry', async () => {
    const { service, prisma, loyaltyService } = makeService();
    loyaltyService.updateUserLevel.mockRejectedValueOnce(new Error('loyalty sync failed'));

    const result = await service.attemptPurchaseAccounting('order_1', { force: true });

    expect(result).toMatchObject({
      orderId: 'order_1',
      status: CompletionAccountingStatus.FAILED,
      applied: false,
      reason: 'failed',
      error: 'loyalty sync failed',
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: expect.objectContaining({
        completionAccountingStatus: CompletionAccountingStatus.FAILED,
        completionAccountingLastError: 'loyalty sync failed',
        completionAccountingNextRetryAt: expect.any(Date),
      }),
    });
  });

  it('не применяет accounting повторно, если marker уже выставлен', async () => {
    const { service, prisma, referralsService, loyaltyService } = makeService({
      completionAccountingAppliedAt: new Date('2026-06-01T00:00:00Z'),
      completionAccountingStatus: CompletionAccountingStatus.APPLIED,
    });

    const result = await service.attemptPurchaseAccounting('order_1', { force: true });

    expect(result).toMatchObject({
      status: CompletionAccountingStatus.APPLIED,
      applied: false,
      reason: 'already_applied',
    });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(referralsService.awardReferralBonus).not.toHaveBeenCalled();
    expect(loyaltyService.updateUserLevel).not.toHaveBeenCalled();
  });

  it('начисляет manual partner promo reward и не создаёт referral reward по тому же order', async () => {
    const { service, referralsService, partnerRewardsService } = makeService({
      promoCodeRedemption: {
        promoCodeId: 'promo_partner_1',
        source: PromoCodeRedemptionSource.MANUAL,
        rewardOwnerIdSnapshot: 'owner_1',
        rewardBonusPercentSnapshot: '12.5',
        rewardPayoutModeSnapshot: ReferralPayoutMode.EXTERNAL,
      },
      user: {
        totalSpent: 10000,
        referralLinkId: 'link_1',
        referredById: 'ref_1',
      },
    });

    const result = await service.attemptPurchaseAccounting('order_1', { force: true });

    expect(result.applied).toBe(true);
    expect(partnerRewardsService.award).toHaveBeenCalledWith({
      ownerId: 'owner_1',
      orderAmount: 100,
      orderId: 'order_1',
      source: {
        kind: 'partner_promo_code',
        promoCodeId: 'promo_partner_1',
        bonusPercent: '12.5',
        payoutMode: ReferralPayoutMode.EXTERNAL,
      },
      client: expect.anything(),
    });
    expect(referralsService.awardReferralBonus).not.toHaveBeenCalled();
  });

  it('помечает top-up order как NOT_REQUIRED и не запускает purchase accounting', async () => {
    const { service, prisma, referralsService } = makeService({
      parentOrderId: 'parent_1',
    });

    const result = await service.attemptPurchaseAccounting('order_1', { force: true });

    expect(result).toMatchObject({
      status: CompletionAccountingStatus.NOT_REQUIRED,
      applied: false,
      reason: 'not_required',
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: {
        completionAccountingStatus: CompletionAccountingStatus.NOT_REQUIRED,
        completionAccountingNextRetryAt: null,
        completionAccountingLastError: null,
      },
    });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(referralsService.awardReferralBonus).not.toHaveBeenCalled();
  });

  it('при ошибке accounting пишет FAILED и retry backoff, не бросая ошибку наружу', async () => {
    const { service, prisma, referralsService } = makeService();
    referralsService.awardReferralBonus.mockRejectedValueOnce(new Error('referral unavailable'));
    prisma.order.findUnique
      .mockResolvedValueOnce(makeAccountingOrder())
      .mockResolvedValueOnce(makeAccountingOrder())
      .mockResolvedValueOnce({
        completionAccountingAttempts: 1,
      });

    const result = await service.attemptPurchaseAccounting('order_1', { force: true });

    expect(result).toMatchObject({
      orderId: 'order_1',
      status: CompletionAccountingStatus.FAILED,
      applied: false,
      reason: 'failed',
      error: 'referral unavailable',
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: expect.objectContaining({
        completionAccountingStatus: CompletionAccountingStatus.FAILED,
        completionAccountingLastError: 'referral unavailable',
        completionAccountingNextRetryAt: expect.any(Date),
      }),
    });
  });

  it('использует безопасный default batch size при некорректном config value', async () => {
    const { prisma, configService } = makeService();
    configService.get.mockImplementation((key: string) =>
      key === 'ORDER_COMPLETION_ACCOUNTING_RETRY_BATCH_SIZE' ? 'not-a-number' : undefined,
    );
    const safeService = new OrderCompletionAccountingService(
      prisma as any,
      { getReferralSettings: jest.fn() } as any,
      { awardReferralBonus: jest.fn() } as any,
      { award: jest.fn() } as any,
      { getEffectiveLevelForSpent: jest.fn(), updateUserLevel: jest.fn() } as any,
      configService as any,
    );

    await safeService.retryPendingAccounting();

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
      }),
    );
  });
});
