import { Prisma, ReferralPayoutMode, TransactionStatus, TransactionType } from '@prisma/client';
import { PartnerRewardsService } from './partner-rewards.service';

function makeService(
  settingsOverride?: Partial<{ bonusPercent: number; minPayout: number; enabled: boolean }>,
) {
  const prisma = {
    user: {
      update: jest.fn().mockResolvedValue(undefined),
    },
    transaction: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn().mockImplementation(async (callback: any) =>
      callback({
        user: {
          update: prisma.user.update,
        },
        transaction: {
          findFirst: prisma.transaction.findFirst,
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
      ...settingsOverride,
    }),
  };

  const service = new PartnerRewardsService(
    prisma as any,
    systemSettingsService as any,
  );

  return { service, prisma, systemSettingsService };
}

describe('PartnerRewardsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BALANCE reward увеличивает bonusBalance и создаёт referral_link ledger', async () => {
    const { service, prisma } = makeService();

    const result = await service.award({
      ownerId: 'owner_1',
      orderId: 'order_1',
      orderAmount: 1000,
      settings: { enabled: true, bonusPercent: 5, minPayout: 500 },
      source: {
        kind: 'referral_link',
        referralLinkId: 'link_1',
        bonusPercent: new Prisma.Decimal(12.5),
        payoutMode: ReferralPayoutMode.BALANCE,
      },
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'owner_1' },
      data: {
        bonusBalance: {
          increment: new Prisma.Decimal(125),
        },
      },
    });
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'owner_1',
        orderId: 'order_1',
        referralLinkId: 'link_1',
        promoCodeId: null,
        type: TransactionType.REFERRAL_BONUS,
        status: TransactionStatus.SUCCEEDED,
        amount: new Prisma.Decimal(125),
        metadata: {
          orderAmount: 1000,
          bonusPercent: 12.5,
          minPayout: 500,
          payoutMode: ReferralPayoutMode.BALANCE,
          source: 'referral_link',
        },
      },
    });
    expect(result).toEqual({ awarded: true, bonusAmount: 125 });
  });

  it('EXTERNAL partner promo reward создаёт transaction с promoCodeId без bonusBalance increment', async () => {
    const { service, prisma } = makeService();

    const result = await service.award({
      ownerId: 'owner_1',
      orderId: 'order_1',
      orderAmount: 2000,
      settings: { enabled: true, bonusPercent: 5, minPayout: 500 },
      source: {
        kind: 'partner_promo_code',
        promoCodeId: 'promo_1',
        bonusPercent: new Prisma.Decimal(10),
        payoutMode: ReferralPayoutMode.EXTERNAL,
      },
    });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'owner_1',
        orderId: 'order_1',
        referralLinkId: null,
        promoCodeId: 'promo_1',
        type: TransactionType.REFERRAL_BONUS,
        status: TransactionStatus.SUCCEEDED,
        amount: new Prisma.Decimal(200),
        metadata: expect.objectContaining({
          bonusPercent: 10,
          payoutMode: ReferralPayoutMode.EXTERNAL,
          source: 'partner_promo_code',
        }),
      }),
    });
    expect(result).toEqual({ awarded: true, bonusAmount: 200 });
  });

  it('duplicate order reward возвращает no-op независимо от owner/source', async () => {
    const { service, prisma } = makeService();
    prisma.transaction.findFirst.mockResolvedValue({
      amount: new Prisma.Decimal(75),
    });

    const result = await service.award({
      ownerId: 'owner_2',
      orderId: 'order_1',
      orderAmount: 1000,
      settings: { enabled: true, bonusPercent: 5, minPayout: 500 },
      source: {
        kind: 'partner_promo_code',
        promoCodeId: 'promo_1',
        bonusPercent: new Prisma.Decimal(10),
        payoutMode: ReferralPayoutMode.BALANCE,
      },
    });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      awarded: false,
      reason: 'already-awarded',
      bonusAmount: 75,
    });
  });

  it('disabled settings возвращают no-op без ledger writes', async () => {
    const { service, prisma } = makeService({ enabled: false });

    const result = await service.award({
      ownerId: 'owner_1',
      orderId: 'order_1',
      orderAmount: 1000,
      source: {
        kind: 'legacy_referral',
        bonusPercent: 5,
      },
    });

    expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(result).toEqual({ awarded: false, reason: 'disabled', bonusAmount: 0 });
  });
});
