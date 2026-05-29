import 'reflect-metadata';
import {
  PromoCodeRedemptionSource,
  PromoCodeRedemptionStatus,
  ReferralPayoutMode,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { PromoCodesService } from './promo-codes.service';

function makeService() {
  const tx = {
    promoCode: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    promoCodeRedemption: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'redemption_1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const prisma = {
    promoCode: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
    },
    promoCodeRedemption: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    order: {
      aggregate: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    transaction: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn().mockImplementation(async (callback: any) => callback(tx)),
  };

  const service = new PromoCodesService(prisma as any);

  return { service, prisma, tx };
}

describe('PromoCodesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('DTO reward policy validation', () => {
    it('принимает обычный промокод без owner/reward policy', async () => {
      const dto = plainToInstance(CreatePromoCodeDto, {
        code: 'PROMO10',
        discountPercent: 10,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('отклоняет owner без percent/payout mode', async () => {
      const dto = plainToInstance(CreatePromoCodeDto, {
        code: 'PARTNER10',
        discountPercent: 10,
        referralOwnerId: 'user_1',
      });

      await expect(validate(dto)).resolves.not.toHaveLength(0);
    });

    it('разрешает update removal только через referralOwnerId=null без reward-полей', async () => {
      const dto = plainToInstance(UpdatePromoCodeDto, {
        referralOwnerId: null,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    });
  });

  it('create создаёт обычный промокод без partner policy', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue(null);
    prisma.promoCode.create.mockResolvedValue({ id: 'promo_1' });
    prisma.transaction.groupBy.mockResolvedValue([]);

    await service.create({
      code: 'promo10',
      discountPercent: 10,
    } as CreatePromoCodeDto);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.promoCode.create).toHaveBeenCalledWith({
      data: {
        code: 'PROMO10',
        discountPercent: 10,
        maxUses: null,
        expiresAt: null,
        isActive: true,
        referralOwnerId: null,
        referralBonusPercent: null,
        referralPayoutMode: null,
      },
      include: expect.any(Object),
    });
  });

  it('create требует существующего owner для partner promo policy', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.create({
        code: 'partner10',
        discountPercent: 10,
        referralOwnerId: 'missing_user',
        referralBonusPercent: 15,
        referralPayoutMode: ReferralPayoutMode.EXTERNAL,
      } as CreatePromoCodeDto),
    ).rejects.toThrow('Владелец партнёрского промокода не найден');
  });

  it('findAll возвращает owner и earnings summary по successful partner promo rewards', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findMany.mockResolvedValue([
      {
        id: 'promo_partner_1',
        code: 'PARTNER10',
        referralOwner: { id: 'owner_1' },
      },
      {
        id: 'promo_regular_1',
        code: 'PROMO10',
        referralOwner: null,
      },
    ]);
    prisma.transaction.groupBy.mockResolvedValue([
      {
        promoCodeId: 'promo_partner_1',
        _sum: { amount: '250.50' },
      },
    ]);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({
        id: 'promo_partner_1',
        totalReferrerEarnings: '250.50',
      }),
      expect.objectContaining({
        id: 'promo_regular_1',
        totalReferrerEarnings: expect.any(Object),
      }),
    ]);
    expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
      by: ['promoCodeId'],
      where: {
        promoCodeId: { in: ['promo_partner_1', 'promo_regular_1'] },
        type: TransactionType.REFERRAL_BONUS,
        status: TransactionStatus.SUCCEEDED,
      },
      _sum: { amount: true },
    });
  });

  it('getStats возвращает partner promo analytics по consumed redemptions, primary orders и ledger split', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'promo_partner_1',
      code: 'PARTNER10',
      usedCount: 2,
      referralOwnerId: 'owner_1',
      referralOwner: { id: 'owner_1' },
    });
    prisma.promoCodeRedemption.aggregate.mockResolvedValue({
      _count: { id: 3 },
    });
    prisma.order.aggregate.mockResolvedValue({
      _count: { id: 2 },
      _sum: { totalAmount: '1500.00' },
    });
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amount: '250.50' },
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        payoutMode: ReferralPayoutMode.BALANCE,
        rewardsCount: BigInt(1),
        totalEarnings: '100.00',
      },
      {
        payoutMode: ReferralPayoutMode.EXTERNAL,
        rewardsCount: BigInt(1),
        totalEarnings: '150.50',
      },
    ]);

    await expect(service.getStats('promo_partner_1')).resolves.toEqual({
      promoCode: expect.objectContaining({
        id: 'promo_partner_1',
        totalReferrerEarnings: '250.50',
      }),
      stats: {
        uses: 3,
        completedPrimaryOrders: 2,
        commissionableRevenue: '1500.00',
        totalReferrerEarnings: '250.50',
      },
      payoutModeSplit: [
        {
          payoutMode: ReferralPayoutMode.BALANCE,
          rewardsCount: 1,
          totalEarnings: '100.00',
        },
        {
          payoutMode: ReferralPayoutMode.EXTERNAL,
          rewardsCount: 1,
          totalEarnings: '150.50',
        },
      ],
    });
    expect(prisma.promoCodeRedemption.aggregate).toHaveBeenCalledWith({
      where: {
        promoCodeId: 'promo_partner_1',
        status: PromoCodeRedemptionStatus.CONSUMED,
      },
      _count: { id: true },
    });
    expect(prisma.order.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETED',
        parentOrderId: null,
        promoCodeRedemption: {
          is: {
            promoCodeId: 'promo_partner_1',
            status: PromoCodeRedemptionStatus.CONSUMED,
          },
        },
      },
      _count: { id: true },
      _sum: { totalAmount: true },
    });
    expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
      where: {
        promoCodeId: 'promo_partner_1',
        type: TransactionType.REFERRAL_BONUS,
        status: TransactionStatus.SUCCEEDED,
      },
      _sum: { amount: true },
    });
  });

  it('getStats возвращает 404 для отсутствующего промокода', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue(null);

    await expect(service.getStats('missing')).rejects.toThrow('Промокод не найден');
    expect(prisma.promoCodeRedemption.aggregate).not.toHaveBeenCalled();
  });

  it('reserveForOrder создаёт RESERVED redemption при наличии capacity', async () => {
    const { service, tx } = makeService();
    tx.promoCode.findUnique
      .mockResolvedValueOnce({
        id: 'promo_1',
        code: 'PROMO10',
        isActive: true,
        expiresAt: null,
        maxUses: 2,
        usedCount: 0,
        discountPercent: 10,
      })
      .mockResolvedValueOnce({
        id: 'promo_1',
        code: 'PROMO10',
        isActive: true,
        expiresAt: null,
        maxUses: 2,
        usedCount: 0,
        discountPercent: 10,
      });

    await service.reserveForOrder(
      'promo10',
      'user_1',
      'order_1',
      PromoCodeRedemptionSource.REFERRAL_LINK_AUTO,
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.promoCodeRedemption.count).toHaveBeenCalledWith({
      where: {
        promoCodeId: 'promo_1',
        status: PromoCodeRedemptionStatus.RESERVED,
      },
    });
    expect(tx.promoCodeRedemption.create).toHaveBeenCalledWith({
      data: {
        promoCodeId: 'promo_1',
        userId: 'user_1',
        orderId: 'order_1',
        source: PromoCodeRedemptionSource.REFERRAL_LINK_AUTO,
        status: PromoCodeRedemptionStatus.RESERVED,
        rewardOwnerIdSnapshot: null,
        rewardBonusPercentSnapshot: null,
        rewardPayoutModeSnapshot: null,
      },
    });
  });

  it('reserveForOrder snapshot-ит partner reward policy с залоченного promo row', async () => {
    const { service, tx } = makeService();
    tx.promoCode.findUnique
      .mockResolvedValueOnce({
        id: 'promo_1',
        code: 'PARTNER10',
        isActive: true,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        discountPercent: 10,
      })
      .mockResolvedValueOnce({
        id: 'promo_1',
        code: 'PARTNER10',
        isActive: true,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        discountPercent: 10,
        referralOwnerId: 'owner_1',
        referralBonusPercent: '12.5',
        referralPayoutMode: ReferralPayoutMode.EXTERNAL,
      });

    await service.reserveForOrder(
      'partner10',
      'buyer_1',
      'order_1',
      PromoCodeRedemptionSource.MANUAL,
    );

    expect(tx.promoCodeRedemption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        promoCodeId: 'promo_1',
        userId: 'buyer_1',
        orderId: 'order_1',
        source: PromoCodeRedemptionSource.MANUAL,
        status: PromoCodeRedemptionStatus.RESERVED,
        rewardOwnerIdSnapshot: 'owner_1',
        rewardBonusPercentSnapshot: '12.5',
        rewardPayoutModeSnapshot: ReferralPayoutMode.EXTERNAL,
      }),
    });
  });

  it('update очищает reward policy при снятии owner', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValueOnce({
      id: 'promo_1',
      code: 'PARTNER10',
    });
    prisma.promoCode.update.mockResolvedValue({ id: 'promo_1' });
    prisma.transaction.groupBy.mockResolvedValue([]);

    await service.update('promo_1', {
      referralOwnerId: null,
    } as UpdatePromoCodeDto);

    expect(prisma.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'promo_1' },
      data: {
        referralOwner: { disconnect: true },
        referralBonusPercent: null,
        referralPayoutMode: null,
      },
      include: expect.any(Object),
    });
  });

  it('validateForReservation возвращает promoId для дальнейшего durable reserve path', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'promo_1',
      code: 'PROMO10',
      isActive: true,
      expiresAt: null,
      maxUses: 2,
      usedCount: 0,
      discountPercent: 10,
    });

    await expect(service.validateForReservation('promo10')).resolves.toEqual({
      valid: true,
      promoId: 'promo_1',
      code: 'PROMO10',
      discountPercent: 10,
      partnerRewardPolicy: null,
    });
  });

  it('validateForReservation возвращает internal partner reward policy для checkout context', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'promo_partner_1',
      code: 'PARTNER10',
      isActive: true,
      expiresAt: null,
      maxUses: null,
      usedCount: 0,
      discountPercent: 10,
      referralOwnerId: 'owner_1',
      referralBonusPercent: '12.5',
      referralPayoutMode: ReferralPayoutMode.EXTERNAL,
    });

    await expect(service.validateForReservation('partner10')).resolves.toEqual({
      valid: true,
      promoId: 'promo_partner_1',
      code: 'PARTNER10',
      discountPercent: 10,
      partnerRewardPolicy: {
        ownerId: 'owner_1',
        bonusPercent: '12.5',
        payoutMode: ReferralPayoutMode.EXTERNAL,
      },
    });
  });

  it('validate не раскрывает partner owner/reward metadata в public endpoint contract', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'promo_partner_1',
      code: 'PARTNER10',
      isActive: true,
      expiresAt: null,
      maxUses: null,
      usedCount: 0,
      discountPercent: 10,
      referralOwnerId: 'owner_1',
      referralBonusPercent: '12.5',
      referralPayoutMode: ReferralPayoutMode.EXTERNAL,
    });

    await expect(service.validate('partner10')).resolves.toEqual({
      valid: true,
      promoId: 'promo_partner_1',
      code: 'PARTNER10',
      discountPercent: 10,
    });
  });

  it('reserveForOrder не создаёт reservation, если maxUses уже исчерпан usedCount + reservedCount', async () => {
    const { service, tx } = makeService();
    tx.promoCode.findUnique
      .mockResolvedValueOnce({
        id: 'promo_1',
        code: 'PROMO10',
        isActive: true,
        expiresAt: null,
        maxUses: 1,
        usedCount: 0,
        discountPercent: 10,
      })
      .mockResolvedValueOnce({
        id: 'promo_1',
        code: 'PROMO10',
        isActive: true,
        expiresAt: null,
        maxUses: 1,
        usedCount: 0,
        discountPercent: 10,
      });
    tx.promoCodeRedemption.count.mockResolvedValue(1);

    await expect(
      service.reserveForOrder(
        'PROMO10',
        'user_1',
        'order_1',
        PromoCodeRedemptionSource.REFERRAL_LINK_AUTO,
      ),
    ).rejects.toThrow('Промокод исчерпан');

    expect(tx.promoCodeRedemption.create).not.toHaveBeenCalled();
  });

  it('consumeReservation увеличивает usedCount только один раз', async () => {
    const { service, tx } = makeService();
    tx.promoCodeRedemption.findUnique
      .mockResolvedValueOnce({
        id: 'redemption_1',
        promoCodeId: 'promo_1',
        status: PromoCodeRedemptionStatus.RESERVED,
        promoCode: { id: 'promo_1' },
      })
      .mockResolvedValueOnce({
        id: 'redemption_1',
        promoCodeId: 'promo_1',
        status: PromoCodeRedemptionStatus.CONSUMED,
        promoCode: { id: 'promo_1' },
      });

    const first = await service.consumeReservation('order_1');
    const second = await service.consumeReservation('order_1');

    expect(first).toEqual({
      consumed: true,
      status: PromoCodeRedemptionStatus.CONSUMED,
    });
    expect(second).toEqual({
      consumed: false,
      status: PromoCodeRedemptionStatus.CONSUMED,
    });
    expect(tx.promoCode.update).toHaveBeenCalledTimes(1);
  });

  it('releaseReservation идемпотентно переводит RESERVED в RELEASED', async () => {
    const { service, tx } = makeService();
    tx.promoCodeRedemption.findUnique
      .mockResolvedValueOnce({
        id: 'redemption_1',
        status: PromoCodeRedemptionStatus.RESERVED,
      })
      .mockResolvedValueOnce({
        id: 'redemption_1',
        status: PromoCodeRedemptionStatus.RELEASED,
      });

    const first = await service.releaseReservation('order_1');
    const second = await service.releaseReservation('order_1');

    expect(first).toEqual({
      released: true,
      status: PromoCodeRedemptionStatus.RELEASED,
    });
    expect(second).toEqual({
      released: false,
      status: PromoCodeRedemptionStatus.RELEASED,
    });
    expect(tx.promoCodeRedemption.update).toHaveBeenCalledTimes(1);
  });

  it('delete запрещает удалять промокод с историей, сохраняя audit trail', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'promo_1',
      _count: {
        redemptions: 1,
        transactions: 0,
        referralLinks: 0,
      },
    });

    await expect(service.delete('promo_1')).rejects.toThrow(
      'Отключите его вместо удаления',
    );
    expect(prisma.promoCode.delete).not.toHaveBeenCalled();
  });

  it('delete удаляет только промокод без связанной истории', async () => {
    const { service, prisma } = makeService();
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'promo_1',
      _count: {
        redemptions: 0,
        transactions: 0,
        referralLinks: 0,
      },
    });
    prisma.promoCode.delete.mockResolvedValue({ id: 'promo_1' });

    await service.delete('promo_1');

    expect(prisma.promoCode.delete).toHaveBeenCalledWith({
      where: { id: 'promo_1' },
    });
  });
});
