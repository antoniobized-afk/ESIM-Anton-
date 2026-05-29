import { Prisma } from '@prisma/client';
import { ReferralsService } from './referrals.service';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { PartnerRewardsService } from './partner-rewards.service';

function makeService(
  settingsOverride?: Partial<{ bonusPercent: number; minPayout: number; enabled: boolean }>,
) {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn(),
    },
    order: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    referralLink: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    promoCode: {
      findUnique: jest.fn(),
    },
    transaction: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      create: jest.fn().mockResolvedValue(undefined),
      aggregate: jest.fn(),
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

  const configService = {
    get: jest.fn().mockImplementation((key: string, fallback?: string) => {
      if (key === 'TELEGRAM_BOT_USERNAME') return 'mojo_mobile_bot';
      return fallback;
    }),
  };

  const partnerRewardsService = new PartnerRewardsService(
    prisma as any,
    systemSettingsService as any,
  );

  const service = new ReferralsService(
    prisma as any,
    systemSettingsService as any,
    configService as any,
    partnerRewardsService,
  );

  return { service, prisma, systemSettingsService, configService, partnerRewardsService };
}

describe('ReferralsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createReferralLink', () => {
    it('создаёт partner referral link после cross-table validation', async () => {
      const { service, prisma } = makeService();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.referralLink.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'owner_1' });
      prisma.promoCode.findUnique.mockResolvedValue({ id: 'promo_1' });
      prisma.referralLink.create.mockResolvedValue({
        id: 'link_1',
        code: 'PARTNER123',
        userId: 'owner_1',
        bonusPercent: new Prisma.Decimal(12.5),
      });

      const result = await service.createReferralLink({
        code: 'PARTNER123',
        userId: 'owner_1',
        promoCodeId: 'promo_1',
        bonusPercent: 12.5,
      });

      expect(prisma.referralLink.create).toHaveBeenCalledWith({
        data: {
          code: 'PARTNER123',
          userId: 'owner_1',
          label: null,
          bonusPercent: new Prisma.Decimal(12.5),
          payoutMode: 'BALANCE',
          promoCodeId: 'promo_1',
          isActive: true,
          expiresAt: null,
        },
        include: {
          promoCode: {
            select: { id: true, code: true },
          },
          user: {
            select: { id: true, referralCode: true, firstName: true, username: true },
          },
        },
      });
      expect(result).toEqual({
        id: 'link_1',
        code: 'PARTNER123',
        userId: 'owner_1',
        bonusPercent: new Prisma.Decimal(12.5),
      });
    });

    it('канонизирует partner code в upper-case перед сохранением', async () => {
      const { service, prisma } = makeService();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.referralLink.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'owner_1' });
      prisma.referralLink.create.mockResolvedValue({
        id: 'link_1',
        code: 'PARTNER_123',
      });

      await service.createReferralLink({
        code: ' partner_123 ',
        userId: 'owner_1',
        bonusPercent: 10,
      });

      expect(prisma.referralLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'PARTNER_123',
          }),
        }),
      );
    });

    it('не даёт создать partner code, совпадающий с User.referralCode', async () => {
      const { service, prisma } = makeService();
      prisma.referralLink.findFirst.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({ id: 'user_1' });

      await expect(
        service.createReferralLink({
          code: 'REF123',
          userId: 'owner_1',
          bonusPercent: 10,
        }),
      ).rejects.toThrow('конфликтует с существующим user referralCode');
    });
  });

  describe('registerReferral', () => {
    it('привязывает пользователя к обычному рефереру, если он ещё не привязан', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique
        .mockResolvedValueOnce({ referredById: null, telegramId: BigInt(123456) })
        .mockResolvedValueOnce({ id: 'referrer_1', referralCode: 'REF123' });
      prisma.referralLink.findUnique.mockResolvedValue(null);

      const result = await service.registerReferral('user_1', 'REF123', BigInt(123456));

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user_1', referredById: null },
        data: {
          referredById: 'referrer_1',
          referralLinkId: null,
        },
      });
      expect(result).toEqual({ id: 'referrer_1', referralCode: 'REF123' });
    });

    it('привязывает пользователя по active partner link без buyer promo snapshot на User', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: null,
        telegramId: BigInt(123456),
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        code: 'PARTNER123',
        userId: 'owner_1',
        isActive: true,
        expiresAt: null,
        user: { id: 'owner_1', referralCode: 'OWNERREF' },
      });

      const result = await service.registerReferral('user_2', 'PARTNER123', BigInt(123456));

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user_2',
          OR: [
            { referredById: null },
            { referralLinkId: { not: null } },
          ],
        },
        data: {
          referredById: 'owner_1',
          referralLinkId: 'link_1',
        },
      });
      expect(result).toEqual({ id: 'owner_1', referralCode: 'OWNERREF' });
    });

    it('перепривязывает пользователя с одной partner link на другую до первой покупки', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: 'old_owner',
        referralLinkId: 'old_link',
        telegramId: BigInt(123456),
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'new_link',
        code: 'NEWPARTNER',
        userId: 'new_owner',
        isActive: true,
        expiresAt: null,
        user: { id: 'new_owner', referralCode: 'NEWOWNER' },
      });

      const result = await service.registerReferral('user_2', 'NEWPARTNER', BigInt(123456));

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user_2',
          status: 'COMPLETED',
          parentOrderId: null,
        },
        select: { id: true },
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user_2',
          OR: [
            { referredById: null },
            { referralLinkId: { not: null } },
          ],
        },
        data: {
          referredById: 'new_owner',
          referralLinkId: 'new_link',
        },
      });
      expect(result).toEqual({ id: 'new_owner', referralCode: 'NEWOWNER' });
    });

    it('не привязывает по partner link пользователя с completed primary order', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: null,
        telegramId: BigInt(123456),
      });
      prisma.order.findFirst.mockResolvedValueOnce({ id: 'order_1' });

      const result = await service.registerReferral('user_2', 'PARTNER123', BigInt(123456));

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user_2',
          status: 'COMPLETED',
          parentOrderId: null,
        },
        select: { id: true },
      });
      expect(prisma.referralLink.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('ищет partner link case-insensitive через canonical upper-case code', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: null,
        telegramId: BigInt(123456),
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        code: 'PARTNER123',
        userId: 'owner_1',
        isActive: true,
        expiresAt: null,
        user: { id: 'owner_1', referralCode: 'OWNERREF' },
      });

      await service.registerReferral('user_2', 'partner123', BigInt(123456));

      expect(prisma.referralLink.findUnique).toHaveBeenCalledWith({
        where: { code: 'PARTNER123' },
        include: {
          user: {
            select: { id: true, referralCode: true },
          },
        },
      });
    });

    it('не fallback-ится на user referral code, если partner link неактивен', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: null,
        telegramId: BigInt(123456),
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        code: 'PARTNER123',
        userId: 'owner_1',
        isActive: false,
        expiresAt: null,
        promoCode: null,
        user: { id: 'owner_1', referralCode: 'OWNERREF' },
      });

      const result = await service.registerReferral('user_2', 'PARTNER123', BigInt(123456));

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    it('не перепривязывает уже привязанного пользователя', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: 'existing_referrer',
        telegramId: BigInt(123456),
      });

      const result = await service.registerReferral('user_1', 'REF123', BigInt(123456));

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('не допускает self-referral для partner link', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: null,
        telegramId: BigInt(123456),
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        code: 'PARTNER123',
        userId: 'user_1',
        isActive: true,
        expiresAt: null,
        promoCode: null,
        user: { id: 'user_1', referralCode: 'SELFREF' },
      });

      const result = await service.registerReferral('user_1', 'PARTNER123', BigInt(123456));

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('не перезаписывает attribution, если conditional updateMany вернул count=0', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: null,
        telegramId: BigInt(123456),
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        code: 'PARTNER123',
        userId: 'owner_1',
        isActive: true,
        expiresAt: null,
        user: { id: 'owner_1', referralCode: 'OWNERREF' },
      });
      prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.registerReferral('user_2', 'PARTNER123', BigInt(123456));

      expect(result).toBeNull();
    });

    it('отклоняет bot registration при несовпадении telegram identity', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: null,
        telegramId: BigInt(111111),
      });

      await expect(
        service.registerReferral('user_1', 'REF123', BigInt(222222)),
      ).rejects.toThrow('Telegram identity mismatch');
    });
  });

  describe('awardReferralBonus', () => {
    it('читает referral settings из SystemSettings и создаёт bonus transaction', async () => {
      const { service, prisma, systemSettingsService } = makeService({
        bonusPercent: 7,
        minPayout: 900,
        enabled: true,
      });
      prisma.order.findUnique.mockResolvedValue({ user: { referralLinkId: null } });

      const result = await service.awardReferralBonus('ref_1', 1200, 'order_1');

      expect(systemSettingsService.getReferralSettings).toHaveBeenCalledTimes(1);
      expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
        where: {
          orderId: 'order_1',
          type: TransactionType.REFERRAL_BONUS,
          status: TransactionStatus.SUCCEEDED,
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'ref_1' },
        data: {
          bonusBalance: {
            increment: new Prisma.Decimal(84),
          },
        },
      });
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'ref_1',
          orderId: 'order_1',
          referralLinkId: null,
          promoCodeId: null,
          type: TransactionType.REFERRAL_BONUS,
          status: TransactionStatus.SUCCEEDED,
          amount: new Prisma.Decimal(84),
          metadata: {
            orderAmount: 1200,
            bonusPercent: 7,
            minPayout: 900,
            payoutMode: 'BALANCE',
            source: 'legacy_referral',
          },
        },
      });
      expect(result).toEqual({ awarded: true, bonusAmount: 84 });
    });

    it('может начислять referral bonus внутри переданной транзакции', async () => {
      const { service, prisma } = makeService({
        bonusPercent: 7,
        minPayout: 900,
        enabled: true,
      });
      const tx = {
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(undefined),
        },
        user: {
          update: jest.fn().mockResolvedValue(undefined),
        },
      };

      const result = await service.awardReferralBonus('ref_1', 1200, 'order_1', null, tx as any);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.transaction.findFirst).toHaveBeenCalledWith({
        where: {
          orderId: 'order_1',
          type: TransactionType.REFERRAL_BONUS,
          status: TransactionStatus.SUCCEEDED,
        },
      });
      expect(tx.user.update).toHaveBeenCalled();
      expect(tx.transaction.create).toHaveBeenCalled();
      expect(result).toEqual({ awarded: true, bonusAmount: 84 });
    });

    it('ничего не делает, если referral program выключена', async () => {
      const { service, prisma } = makeService({ enabled: false });

      const result = await service.awardReferralBonus('ref_1', 1200, 'order_1');

      expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(result).toEqual({ awarded: false, reason: 'disabled', bonusAmount: 0 });
    });

    it('не начисляет бонус повторно для того же completed order', async () => {
      const { service, prisma } = makeService();
      prisma.order.findUnique.mockResolvedValue({ user: { referralLinkId: null } });
      prisma.transaction.findFirst.mockResolvedValue({
        amount: 60,
      });

      const result = await service.awardReferralBonus('ref_1', 1200, 'order_1');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        awarded: false,
        reason: 'already-awarded',
        bonusAmount: 60,
      });
    });

    it('использует individual percent из ReferralLink и пишет referralLinkId в transaction', async () => {
      const { service, prisma } = makeService({
        bonusPercent: 5,
        minPayout: 500,
        enabled: true,
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        bonusPercent: new Prisma.Decimal(12.5),
        payoutMode: 'BALANCE',
      });

      const result = await service.awardReferralBonus(
        'ref_1',
        1200,
        'order_1',
        'link_1',
      );

      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          referralLinkId: 'link_1',
          amount: new Prisma.Decimal(150),
          metadata: expect.objectContaining({
            bonusPercent: 12.5,
          }),
        }),
      });
      expect(result).toEqual({ awarded: true, bonusAmount: 150 });
    });

    it('не fallback-ится на глобальный процент, если explicit referralLinkId не найден', async () => {
      const { service, prisma } = makeService({
        bonusPercent: 5,
        minPayout: 500,
        enabled: true,
      });
      prisma.referralLink.findUnique.mockResolvedValue(null);

      await expect(
        service.awardReferralBonus('ref_1', 1200, 'order_1', 'missing_link'),
      ).rejects.toThrow('Referral link для начисления бонуса не найден');

      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('при payoutMode=EXTERNAL создаёт transaction, но НЕ увеличивает bonusBalance', async () => {
      const { service, prisma } = makeService({
        bonusPercent: 5,
        minPayout: 500,
        enabled: true,
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_ext',
        bonusPercent: new Prisma.Decimal(10),
        payoutMode: 'EXTERNAL',
      });

      const result = await service.awardReferralBonus(
        'ref_1',
        1000,
        'order_1',
        'link_ext',
      );

      // bonusBalance НЕ увеличивается
      expect(prisma.user.update).not.toHaveBeenCalled();

      // Transaction создаётся для статистики
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          referralLinkId: 'link_ext',
          type: TransactionType.REFERRAL_BONUS,
          status: TransactionStatus.SUCCEEDED,
          amount: new Prisma.Decimal(100),
          metadata: expect.objectContaining({
            payoutMode: 'EXTERNAL',
            bonusPercent: 10,
          }),
        }),
      });
      expect(result).toEqual({ awarded: true, bonusAmount: 100 });
    });

    it('при payoutMode=BALANCE (default) увеличивает bonusBalance как обычно', async () => {
      const { service, prisma } = makeService({
        bonusPercent: 5,
        minPayout: 500,
        enabled: true,
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_bal',
        bonusPercent: new Prisma.Decimal(10),
        payoutMode: 'BALANCE',
      });

      const result = await service.awardReferralBonus(
        'ref_1',
        1000,
        'order_1',
        'link_bal',
      );

      // bonusBalance увеличивается
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'ref_1' },
        data: {
          bonusBalance: {
            increment: new Prisma.Decimal(100),
          },
        },
      });

      // Transaction создаётся
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            payoutMode: 'BALANCE',
          }),
        }),
      });
      expect(result).toEqual({ awarded: true, bonusAmount: 100 });
    });
  });

  describe('getReferralLinkStats', () => {
    it('считает primary aggregates через БД и ограничивает список referred users', async () => {
      const { service, prisma } = makeService();
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        promoCode: null,
        user: { id: 'owner_1', referralCode: 'OWNERREF', firstName: 'Owner', username: null },
      });
      prisma.user.count.mockResolvedValue(1);
      prisma.order.aggregate.mockResolvedValue({
        _count: { id: 2 },
        _sum: { totalAmount: new Prisma.Decimal(350) },
      });
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user_2',
          username: 'alex',
          firstName: 'Alex',
          createdAt: new Date('2026-05-01T00:00:00Z'),
          orders: [
            { totalAmount: new Prisma.Decimal(100) },
            { totalAmount: new Prisma.Decimal(250) },
          ],
        },
      ]);
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(50) },
      });

      const result = await service.getReferralLinkStats('link_1');

      expect(prisma.order.aggregate).toHaveBeenCalled();
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { referralLinkId: 'link_1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          username: true,
          firstName: true,
          createdAt: true,
          orders: {
            where: {
              status: 'COMPLETED',
              parentOrderId: null,
            },
            select: {
              totalAmount: true,
            },
          },
        },
      });
      expect(prisma.order.groupBy).not.toHaveBeenCalled();
      expect(result.stats).toEqual({
        registrations: 1,
        ordersCount: 2,
        commissionableRevenue: new Prisma.Decimal(350),
        totalReferrerEarnings: new Prisma.Decimal(50),
      });
      expect(result.referredUsers).toEqual([
        {
          id: 'user_2',
          name: 'Alex',
          joinedAt: new Date('2026-05-01T00:00:00Z'),
          totalOrders: 2,
          totalSpent: new Prisma.Decimal(350),
        },
      ]);
    });
  });

  describe('getReferralLinkPublicInfo', () => {
    it('возвращает isValid=true и promoCode для active link', async () => {
      const { service, prisma } = makeService();
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        isActive: true,
        expiresAt: null,
        promoCode: { code: 'PROMO10' },
      });

      const result = await service.getReferralLinkPublicInfo('partner123');

      expect(prisma.referralLink.findUnique).toHaveBeenCalledWith({
        where: { code: 'PARTNER123' },
        include: {
          promoCode: { select: { code: true } },
        },
      });
      expect(result).toEqual({ isValid: true, promoCode: 'PROMO10' });
    });

    it('возвращает isValid=false для неактивной ссылки', async () => {
      const { service, prisma } = makeService();
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        isActive: false,
        expiresAt: null,
        promoCode: { code: 'PROMO10' },
      });

      const result = await service.getReferralLinkPublicInfo('PARTNER123');

      expect(result).toEqual({ isValid: false, promoCode: null });
    });

    it('возвращает isValid=false для несуществующего кода', async () => {
      const { service, prisma } = makeService();
      prisma.referralLink.findUnique.mockResolvedValue(null);

      const result = await service.getReferralLinkPublicInfo('UNKNOWN');

      expect(result).toEqual({ isValid: false, promoCode: null });
    });

    it('не отдаёт userId, bonusPercent, label или stats', async () => {
      const { service, prisma } = makeService();
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        userId: 'owner_1',
        bonusPercent: 15,
        label: 'Secret Label',
        isActive: true,
        expiresAt: null,
        promoCode: { code: 'PROMO10' },
      });

      const result = await service.getReferralLinkPublicInfo('PARTNER123');

      expect(result).toEqual({ isValid: true, promoCode: 'PROMO10' });
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('bonusPercent');
      expect(result).not.toHaveProperty('label');
    });
  });

  describe('getReferralLinks', () => {
    it('возвращает paginated список с meta', async () => {
      const { service, prisma } = makeService();
      prisma.referralLink.findMany.mockResolvedValue([
        { id: 'link_1', code: 'PARTNER1', _count: { referredUsers: 5, transactions: 3 } },
      ]);
      prisma.referralLink.count.mockResolvedValue(1);

      const result = await service.getReferralLinks({ page: 1, limit: 20 });

      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(result.data).toHaveLength(1);
    });

    it('использует _count для summary stats без per-link N+1', async () => {
      const { service, prisma } = makeService();
      prisma.referralLink.findMany.mockResolvedValue([]);
      prisma.referralLink.count.mockResolvedValue(0);

      await service.getReferralLinks({});

      const findManyCall = prisma.referralLink.findMany.mock.calls[0][0];
      expect(findManyCall.include._count).toEqual({
        select: { referredUsers: true, transactions: true },
      });
    });
  });

  describe('registerReferral — web path (без telegramId)', () => {
    it('привязывает пользователя без проверки telegramId', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique
        .mockResolvedValueOnce({ referredById: null, telegramId: BigInt(123456) })
        .mockResolvedValueOnce({ id: 'referrer_1', referralCode: 'REF123' });
      prisma.referralLink.findUnique.mockResolvedValue(null);

      const result = await service.registerReferral('user_1', 'REF123');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user_1', referredById: null },
        data: {
          referredById: 'referrer_1',
          referralLinkId: null,
        },
      });
      expect(result).toEqual({ id: 'referrer_1', referralCode: 'REF123' });
    });

    it('не привязывает legacy referral code, если уже есть completed primary order', async () => {
      const { service, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValueOnce({
        referredById: null,
        telegramId: BigInt(123456),
      });
      prisma.order.findFirst.mockResolvedValueOnce({ id: 'order_1' });

      const result = await service.registerReferral('user_1', 'REF123');

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user_1',
          status: 'COMPLETED',
          parentOrderId: null,
        },
        select: { id: true },
      });
      expect(prisma.referralLink.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('getReferralStats', () => {
    it('возвращает runtime-backed referral stats shape для client', async () => {
      const { service, prisma, configService } = makeService({
        bonusPercent: 9,
        minPayout: 700,
        enabled: true,
      });
      prisma.user.findUnique.mockResolvedValue({
        referralCode: 'REF123',
        referrals: [
          {
            id: 'user_2',
            username: 'alex',
            firstName: 'Alex',
            createdAt: new Date('2026-05-01T00:00:00Z'),
            orders: [{ totalAmount: 100 }, { totalAmount: 250 }],
          },
        ],
      });
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: {
          amount: 55,
        },
      });

      const result = await service.getReferralStats('user_1');

      expect(configService.get).toHaveBeenCalledWith(
        'TELEGRAM_BOT_USERNAME',
        'mojo_mobile_bot',
      );
      expect(result).toEqual({
        referralCode: 'REF123',
        referralLink: 'https://t.me/mojo_mobile_bot?start=ref_REF123',
        referralsCount: 1,
        totalEarnings: 55,
        referralPercent: 9,
        enabled: true,
        minPayout: 700,
        referrals: [
          {
            id: 'user_2',
            name: 'Alex',
            joinedAt: new Date('2026-05-01T00:00:00Z'),
            totalOrders: 2,
            totalSpent: 350,
          },
        ],
      });
    });
  });
});
