import {
  PromoCodeRedemptionSource,
  PromoCodeRedemptionStatus,
} from '@prisma/client';
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
    },
    $transaction: jest.fn().mockImplementation(async (callback: any) => callback(tx)),
  };

  const service = new PromoCodesService(prisma as any);

  return { service, prisma, tx };
}

describe('PromoCodesService', () => {
  beforeEach(() => jest.clearAllMocks());

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
      },
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
});
