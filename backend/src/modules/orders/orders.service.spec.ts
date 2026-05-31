import { BadRequestException } from '@nestjs/common';
import {
  OrderStatus,
  PromoCodeRedemptionSource,
  PromoCodeSource,
  ReferralPayoutMode,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { OrdersService } from './orders.service';

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    userId: 'user_1',
    status: OrderStatus.PAID,
    totalAmount: 100,
    periodNum: null,
    parentOrderId: null,
    topupPackageCode: null,
    product: {
      providerId: 'provider_plan_1',
      providerPrice: 10,
      country: 'Япония',
      dataAmount: '10 GB',
    },
    user: {
      id: 'user_1',
      email: 'user@example.com',
      telegramId: null,
      totalSpent: 10000,
      referralLinkId: null,
      loyaltyLevel: {
        cashbackPercent: 10,
      },
      referredById: 'ref_1',
    },
    transactions: [],
    repeatChargeAttempt: null,
    completionAccountingAppliedAt: null,
    ...overrides,
  };
}

function makeService(orderOverrides: Record<string, unknown> = {}) {
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(makeOrder(orderOverrides)),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'order_1',
          status: data.status,
          ...data,
        }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'order_1',
          ...data,
          product: { providerId: 'provider_plan_1', providerPrice: 10, isActive: true },
          user: { id: 'user_1' },
        }),
      ),
    },
    referralLink: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    promoCodeRedemption: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    user: {
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    transaction: {
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        if (where?.status === TransactionStatus.PENDING) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') {
        return arg({
          user: {
            findUnique: jest.fn().mockResolvedValue({ balance: 1000 }),
            update: prisma.user.update,
            updateMany: prisma.user.updateMany,
          },
          order: {
            findUnique: prisma.order.findUnique,
            create: prisma.order.create,
            update: prisma.order.update,
            updateMany: prisma.order.updateMany,
          },
          transaction: {
            findFirst: prisma.transaction.findFirst,
            create: prisma.transaction.create,
            updateMany: prisma.transaction.updateMany,
          },
          promoCodeRedemption: {
            findUnique: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue(undefined),
          },
          promoCode: {
            update: jest.fn().mockResolvedValue(undefined),
          },
          $queryRaw: jest.fn().mockResolvedValue([]),
        });
      }
      return Promise.all(arg);
    }),
  };

  const productsService = {
    findById: jest.fn().mockResolvedValue({
      id: 'product_1',
      ourPrice: 100,
      providerPrice: 10,
      providerId: 'provider_plan_1',
      isActive: true,
      isUnlimited: false,
      country: 'Япония',
      dataAmount: '10 GB',
    }),
  };

  const usersService = {
    findById: jest.fn().mockResolvedValue({
      id: 'user_1',
      balance: 1000,
      bonusBalance: 100,
      totalSpent: 10000,
      loyaltyLevel: {
        discount: 0,
      },
    }),
    updateBalance: jest.fn().mockResolvedValue(undefined),
  };

  const esimProviderService = {
    purchaseEsim: jest.fn().mockResolvedValue({
      qr_code: 'qr',
      iccid: 'iccid-1',
      activation_code: 'act-1',
      order_id: 'provider-order-1',
      smdp_address: 'smdp.example',
    }),
  };

  const promoCodesService = {
    validate: jest.fn(),
    validateForReservation: jest.fn().mockResolvedValue({
      valid: true,
      promoId: 'promo_1',
      code: 'PROMO10',
      discountPercent: 10,
    }),
    reserveForOrder: jest.fn().mockResolvedValue(undefined),
    consumeReservation: jest.fn().mockResolvedValue({ consumed: false, status: null }),
    releaseReservation: jest.fn().mockResolvedValue({ released: false, status: null }),
  };

  const telegramNotification = {
    sendEsimDetails: jest.fn().mockResolvedValue(undefined),
    sendTextNotification: jest.fn().mockResolvedValue(undefined),
  };

  const emailService = {
    sendEsimReady: jest.fn().mockResolvedValue(undefined),
  };

  const pushService = {
    sendPaymentSuccess: jest.fn().mockResolvedValue(undefined),
  };

  const systemSettingsService = {
    getPricingSettings: jest.fn(),
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
    updateUserLevel: jest.fn().mockResolvedValue(undefined),
    getEffectiveLevelForSpent: jest.fn().mockResolvedValue({
      id: 'silver',
      name: 'Серебро',
      minSpent: 10000,
      cashbackPercent: 10,
      discount: 0,
    }),
  };

  const service = new OrdersService(
    prisma as any,
    productsService as any,
    usersService as any,
    esimProviderService as any,
    promoCodesService as any,
    telegramNotification as any,
    emailService as any,
    pushService as any,
    systemSettingsService as any,
    referralsService as any,
    partnerRewardsService as any,
    loyaltyService as any,
  );

  return {
    service,
    prisma,
    usersService,
    esimProviderService,
    emailService,
    pushService,
    referralsService,
    partnerRewardsService,
    loyaltyService,
    systemSettingsService,
  };
}

describe('OrdersService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('fulfillOrder Phase 4 wiring', () => {
    it('начисляет cashback, referral bonus и пересчитывает loyalty level после successful purchase', async () => {
      const {
        service,
        prisma,
        usersService,
        referralsService,
        loyaltyService,
        emailService,
        pushService,
      } = makeService();

      const result = await service.fulfillOrder('order_1');

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order_1' },
        data: expect.objectContaining({
          status: OrderStatus.COMPLETED,
          qrCode: 'qr',
          iccid: 'iccid-1',
          activationCode: 'act-1',
          providerOrderId: 'provider-order-1',
          smdpAddress: 'smdp.example',
          completedAt: expect.any(Date),
        }),
      });
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
      expect(usersService.updateBalance).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'user_1' },
        data: {
          bonusBalance: {
            increment: 10,
          },
        },
      });
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_1',
          orderId: 'order_1',
          type: TransactionType.BONUS_ACCRUAL,
          status: TransactionStatus.SUCCEEDED,
          amount: expect.anything(),
          metadata: {
            source: 'loyalty_cashback',
            cashbackPercent: 10,
          },
        }),
      });
      expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'user_1' },
        data: { totalSpent: { increment: 100 } },
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
      expect(loyaltyService.updateUserLevel).toHaveBeenCalledWith('user_1');
      expect(loyaltyService.getEffectiveLevelForSpent).toHaveBeenCalledWith(10000);
      expect(emailService.sendEsimReady).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(OrderStatus.COMPLETED);
    });

    it('не применяет completion accounting повторно, если marker уже выставлен', async () => {
      const { service, prisma, referralsService, loyaltyService } = makeService();
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await (service as any).applyPurchaseCompletionEffects(
        makeOrder({ status: OrderStatus.COMPLETED }),
      );

      expect(result).toEqual({ applied: false });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(referralsService.awardReferralBonus).not.toHaveBeenCalled();
      expect(loyaltyService.updateUserLevel).not.toHaveBeenCalled();
    });

    it('начисляет reward владельцу manual partner promo и не создаёт referral reward по тому же order', async () => {
      const { service, referralsService, partnerRewardsService } = makeService();

      const result = await (service as any).applyPurchaseCompletionEffects(
        makeOrder({
          promoCodeRedemption: {
            promoCodeId: 'promo_partner_1',
            source: PromoCodeRedemptionSource.MANUAL,
            rewardOwnerIdSnapshot: 'owner_1',
            rewardBonusPercentSnapshot: '12.5',
            rewardPayoutModeSnapshot: ReferralPayoutMode.EXTERNAL,
          },
          user: {
            id: 'user_1',
            totalSpent: 10000,
            referralLinkId: 'link_1',
            referredById: 'ref_1',
          },
        }),
      );

      expect(result).toEqual({ applied: true });
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

    it('не fallback-ится в referral reward, если manual partner promo snapshot принадлежит buyer', async () => {
      const { service, referralsService, partnerRewardsService } = makeService();

      await (service as any).applyPurchaseCompletionEffects(
        makeOrder({
          promoCodeRedemption: {
            promoCodeId: 'promo_partner_1',
            source: PromoCodeRedemptionSource.MANUAL,
            rewardOwnerIdSnapshot: 'user_1',
            rewardBonusPercentSnapshot: '12.5',
            rewardPayoutModeSnapshot: ReferralPayoutMode.BALANCE,
          },
          user: {
            id: 'user_1',
            totalSpent: 10000,
            referralLinkId: 'link_1',
            referredById: 'ref_1',
          },
        }),
      );

      expect(partnerRewardsService.award).not.toHaveBeenCalled();
      expect(referralsService.awardReferralBonus).not.toHaveBeenCalled();
    });

    it('оставляет заказ в processing для reconciliation, если referral awarding падает после выдачи eSIM', async () => {
      const { service, prisma, referralsService, loyaltyService, emailService } = makeService();
      referralsService.awardReferralBonus.mockRejectedValue(new Error('referral unavailable'));
      prisma.order.update
        .mockResolvedValueOnce({
          id: 'order_1',
          status: OrderStatus.COMPLETED,
          providerOrderId: 'provider-order-1',
          providerResponse: { order_id: 'provider-order-1' },
          iccid: 'iccid-1',
          qrCode: 'qr',
          activationCode: 'act-1',
          completedAt: expect.any(Date),
        })
        .mockResolvedValueOnce({
        ...makeOrder({
          status: OrderStatus.PROCESSING,
          providerOrderId: 'provider-order-1',
          providerResponse: { order_id: 'provider-order-1' },
          iccid: 'iccid-1',
          qrCode: 'qr',
          activationCode: 'act-1',
          errorMessage:
            'Provider issuance succeeded, local finalize failed: referral unavailable',
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.SUCCEEDED,
              amount: 100,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'card',
              metadata: {},
            },
          ],
        }),
      });

      await expect(service.fulfillOrder('order_1')).rejects.toThrow('referral unavailable');

      expect(loyaltyService.updateUserLevel).not.toHaveBeenCalled();
      expect(emailService.sendEsimReady).not.toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: 'order_1' },
          data: expect.objectContaining({
            status: OrderStatus.PROCESSING,
            errorMessage:
              'Provider issuance succeeded, local finalize failed: referral unavailable',
          }),
        }),
      );
    });

    it('не вызывает provider повторно, если заказ уже completed другим worker', async () => {
      const { service, prisma, esimProviderService } = makeService();
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.order.findUnique.mockResolvedValueOnce({
        ...makeOrder({ status: OrderStatus.COMPLETED }),
        status: OrderStatus.COMPLETED,
      });
      prisma.order.findUnique.mockResolvedValueOnce({
        ...makeOrder({ status: OrderStatus.COMPLETED }),
        status: OrderStatus.COMPLETED,
      });

      const result = await service.fulfillOrder('order_1');

      expect(esimProviderService.purchaseEsim).not.toHaveBeenCalled();
      expect(result?.status).toBe(OrderStatus.COMPLETED);
    });

    it('admin retryFulfillment переиспользует canonical fulfillOrder только для PAID', async () => {
      const { service } = makeService();

      const result = await service.retryFulfillment('order_1');

      expect(result?.status).toBe(OrderStatus.COMPLETED);
    });

    it('admin retryFulfillment отклоняет не-PAID заказ', async () => {
      const { service, prisma } = makeService();
      prisma.order.findUnique.mockResolvedValueOnce(
        makeOrder({ status: OrderStatus.PROCESSING }),
      );

      await expect(service.retryFulfillment('order_1')).rejects.toThrow(
        'Повторный запуск fulfillment доступен только для оплаченного заказа',
      );
    });

    it('admin recoverPendingPaidOrder переводит pending-заказ с successful payment в canonical fulfillment pipeline', async () => {
      const { service, prisma } = makeService();
      prisma.order.findUnique.mockResolvedValueOnce(
        makeOrder({
          status: OrderStatus.PENDING,
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.SUCCEEDED,
              amount: 100,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'card',
              metadata: {},
            },
          ],
        }),
      );

      const result = await service.recoverPendingPaidOrder('order_1');

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order_1',
          status: OrderStatus.PENDING,
        },
        data: {
          status: OrderStatus.PAID,
          errorMessage: null,
        },
      });
      expect(result?.status).toBe(OrderStatus.COMPLETED);
    });

    it('admin recoverPendingPaidOrder отклоняет pending-заказ без successful payment', async () => {
      const { service, prisma } = makeService();
      prisma.order.findUnique.mockResolvedValueOnce(
        makeOrder({
          status: OrderStatus.PENDING,
          transactions: [],
        }),
      );

      await expect(service.recoverPendingPaidOrder('order_1')).rejects.toThrow(
        'Нельзя запустить recovery без локально зафиксированной успешной payment transaction',
      );
    });

    it('admin finalizeReconciledOrder завершает purchase finalize-failure без повторного provider call', async () => {
      const { service, prisma, esimProviderService } = makeService();
      prisma.order.findUnique
        .mockResolvedValueOnce(
          makeOrder({
            status: OrderStatus.PROCESSING,
            qrCode: 'qr',
            iccid: 'iccid-1',
            activationCode: 'act-1',
            providerOrderId: 'provider-order-1',
            providerResponse: { order_id: 'provider-order-1' },
            errorMessage: 'Provider issuance succeeded, local finalize failed: db down',
            transactions: [
              {
                type: TransactionType.PAYMENT,
                status: TransactionStatus.SUCCEEDED,
                amount: 100,
                paymentProvider: 'cloudpayments',
                paymentMethod: 'card',
                metadata: {},
              },
            ],
          }),
        )
        .mockResolvedValueOnce({
          id: 'order_1',
          userId: 'user_1',
          totalAmount: 100,
          user: {
            totalSpent: 10000,
            referralLinkId: null,
            referredById: 'ref_1',
          },
          promoCodeRedemption: null,
        })
        .mockResolvedValueOnce(
          makeOrder({
            status: OrderStatus.COMPLETED,
            qrCode: 'qr',
            iccid: 'iccid-1',
            activationCode: 'act-1',
            providerOrderId: 'provider-order-1',
            providerResponse: { order_id: 'provider-order-1' },
            errorMessage: null,
          }),
        );

      const result = await service.finalizeReconciledOrder('order_1');

      expect(esimProviderService.purchaseEsim).not.toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order_1' },
          data: expect.objectContaining({
            status: OrderStatus.COMPLETED,
            errorMessage: null,
          }),
        }),
      );
      expect(result?.status).toBe(OrderStatus.COMPLETED);
    });

    it('admin finalizeReconciledOrder отклоняет stuck_processing без issued snapshot contract', async () => {
      const { service, prisma, esimProviderService } = makeService();
      prisma.order.findUnique.mockResolvedValueOnce(
        makeOrder({
          status: OrderStatus.PROCESSING,
          errorMessage: 'still waiting',
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.SUCCEEDED,
              amount: 100,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'card',
              metadata: {},
            },
          ],
        }),
      );

      await expect(service.finalizeReconciledOrder('order_1')).rejects.toThrow(
        'Ручная финализация доступна только для заказа с уже выданным provider snapshot',
      );
      expect(esimProviderService.purchaseEsim).not.toHaveBeenCalled();
    });

    it('блокирует параллельный fulfillment, если другой worker уже перевёл заказ в processing', async () => {
      const { service, prisma, esimProviderService } = makeService();
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.order.findUnique.mockResolvedValueOnce({
        ...makeOrder({ status: OrderStatus.PROCESSING }),
        status: OrderStatus.PROCESSING,
      });

      await expect(service.fulfillOrder('order_1')).rejects.toThrow('Заказ уже обрабатывается');

      expect(esimProviderService.purchaseEsim).not.toHaveBeenCalled();
    });

    it('сохраняет issued snapshot и оставляет заказ в processing, если локальная финализация падает после successful provider purchase', async () => {
      const { service, prisma, esimProviderService } = makeService({
        transactions: [
          {
            type: TransactionType.PAYMENT,
            status: TransactionStatus.SUCCEEDED,
            amount: 100,
            paymentProvider: 'cloudpayments',
            paymentMethod: 'card',
            metadata: {},
          },
        ],
      });
      const finalizedFailure = new Error('db down during complete');
      prisma.order.update.mockRejectedValueOnce(finalizedFailure).mockResolvedValueOnce({
        ...makeOrder({
          status: OrderStatus.PROCESSING,
          providerOrderId: 'provider-order-1',
          providerResponse: { order_id: 'provider-order-1' },
          iccid: 'iccid-1',
          qrCode: 'qr',
          activationCode: 'act-1',
          errorMessage: 'Provider issuance succeeded, local finalize failed: db down during complete',
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.SUCCEEDED,
              amount: 100,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'card',
              metadata: {},
            },
          ],
        }),
      });

      await expect(service.fulfillOrder('order_1')).rejects.toThrow('db down during complete');

      expect(esimProviderService.purchaseEsim).toHaveBeenCalledTimes(1);
      expect(prisma.order.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 'order_1' },
          data: expect.objectContaining({
            status: OrderStatus.COMPLETED,
            providerOrderId: 'provider-order-1',
            iccid: 'iccid-1',
          }),
        }),
      );
      expect(prisma.order.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: 'order_1' },
          data: expect.objectContaining({
            status: OrderStatus.PROCESSING,
            providerOrderId: 'provider-order-1',
            iccid: 'iccid-1',
            errorMessage:
              'Provider issuance succeeded, local finalize failed: db down during complete',
          }),
        }),
      );
      expect(prisma.transaction.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: TransactionType.REFUND }),
        }),
      );
    });

    it('использует dynamic loyalty level для скидки при создании заказа', async () => {
      const { service, prisma, usersService, loyaltyService } = makeService();
      usersService.findById.mockResolvedValue({
        id: 'user_1',
        balance: 1000,
        bonusBalance: 0,
        totalSpent: 20000,
        loyaltyLevel: null,
      });
      loyaltyService.getEffectiveLevelForSpent.mockResolvedValue({
        id: 'gold',
        name: 'Золото',
        minSpent: 20000,
        cashbackPercent: 7,
        discount: 5,
      });

      const order = await service.create('user_1', 'product_1', 1, 0);

      expect(loyaltyService.getEffectiveLevelForSpent).toHaveBeenCalledWith(20000);
      expect(Number(order.discount)).toBe(5);
      expect(Number(order.totalAmount)).toBe(95);
      expect(prisma.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          discount: expect.anything(),
          totalAmount: expect.anything(),
        }),
        include: {
          product: true,
          user: true,
        },
      });
    });

    it('previewPricing использует ту же pricing формулу без создания order и без consume промокода', async () => {
      const { service, prisma, loyaltyService } = makeService();
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validate.mockResolvedValue({
        valid: true,
        code: 'SALE10',
        discountPercent: 10,
      });
      promoCodesService.validateForReservation.mockResolvedValue({
        valid: true,
        promoId: 'promo_1',
        code: 'SALE10',
        discountPercent: 10,
      });
      loyaltyService.getEffectiveLevelForSpent.mockResolvedValue({
        id: 'gold',
        name: 'Золото',
        minSpent: 20000,
        cashbackPercent: 7,
        discount: 5,
      });

      const quote = await service.previewPricing('user_1', 'product_1', {
        promoCode: 'sale10',
      });

      expect(promoCodesService.validateForReservation).toHaveBeenCalledWith('SALE10');
      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(quote).toEqual(
        expect.objectContaining({
          productId: 'product_1',
          promoCode: 'SALE10',
          baseAmount: 100,
          promoDiscount: 10,
          loyaltyDiscount: 4.5,
          totalAmount: 85.5,
          isFree: false,
        }),
      );
    });

    it('previewPricing отклоняет собственный manual partner promo без мутаций', async () => {
      const { service, prisma } = makeService();
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validateForReservation.mockResolvedValue({
        valid: true,
        promoId: 'promo_partner_1',
        code: 'PARTNER10',
        discountPercent: 10,
        partnerRewardPolicy: {
          ownerId: 'user_1',
          bonusPercent: '12.5',
          payoutMode: ReferralPayoutMode.BALANCE,
        },
      });

      await expect(
        service.previewPricing('user_1', 'product_1', {
          promoCode: 'partner10',
        }),
      ).rejects.toThrow('Нельзя применить собственный партнёрский промокод');

      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(promoCodesService.reserveForOrder).not.toHaveBeenCalled();
    });

    it('previewPricing не падает, если auto-promo по реферальной ссылке истёк', async () => {
      const { service, prisma, usersService } = makeService();
      usersService.findById.mockResolvedValue({
        id: 'user_1',
        balance: 1000,
        bonusBalance: 100,
        totalSpent: 10000,
        referralLinkId: 'link_1',
        referredById: 'ref_1',
        loyaltyLevel: {
          discount: 0,
        },
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        isActive: true,
        expiresAt: null,
        promoCode: { code: 'MOJO30' },
      });
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validateForReservation.mockRejectedValueOnce(
        new BadRequestException('Срок действия промокода истёк'),
      );

      const quote = await service.previewPricing('user_1', 'product_1');

      expect(quote).toEqual(
        expect.objectContaining({
          promoCode: null,
          promoCodeSource: null,
          promoStatus: 'unavailable',
          hasReferralAttribution: true,
          totalAmount: 100,
        }),
      );
      expect(quote.promoMessage).toContain('истёк');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('previewPricing использует текущий promo у referral link', async () => {
      const { service, prisma, usersService } = makeService();
      usersService.findById.mockResolvedValue({
        id: 'user_1',
        balance: 1000,
        bonusBalance: 100,
        totalSpent: 10000,
        referralLinkId: 'link_1',
        referredById: 'ref_1',
        loyaltyLevel: {
          discount: 0,
        },
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        isActive: true,
        expiresAt: null,
        promoCode: { code: 'NEW20' },
      });
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validateForReservation.mockResolvedValueOnce({
        valid: true,
        promoId: 'promo_new_20',
        code: 'NEW20',
        discountPercent: 20,
      });

      const quote = await service.previewPricing('user_1', 'product_1');

      expect(promoCodesService.validateForReservation).toHaveBeenCalledWith('NEW20');
      expect(quote).toEqual(
        expect.objectContaining({
          promoCode: 'NEW20',
          promoCodeSource: 'REFERRAL_LINK_AUTO',
          promoStatus: 'applied',
          promoDiscount: 20,
          totalAmount: 80,
        }),
      );
    });

    it('create продолжает checkout без referral auto-promo, если текущий promo у referral link истёк', async () => {
      const { service, prisma, usersService } = makeService();
      usersService.findById.mockResolvedValue({
        id: 'user_1',
        balance: 1000,
        bonusBalance: 100,
        totalSpent: 10000,
        referralLinkId: 'link_1',
        referredById: 'ref_1',
        loyaltyLevel: {
          discount: 0,
        },
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        isActive: true,
        expiresAt: null,
        promoCode: { code: 'MOJO30' },
      });
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validateForReservation.mockRejectedValueOnce(
        new BadRequestException('Срок действия промокода истёк'),
      );

      await service.create('user_1', 'product_1');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            promoCode: null,
            promoCodeSource: null,
          }),
        }),
      );
      expect(promoCodesService.reserveForOrder).not.toHaveBeenCalled();
    });

    it('createWithBalance продолжает checkout без referral auto-promo, если текущий promo у referral link истёк', async () => {
      const { service, prisma, usersService } = makeService();
      usersService.findById.mockResolvedValue({
        id: 'user_1',
        balance: 1000,
        bonusBalance: 100,
        totalSpent: 10000,
        referralLinkId: 'link_1',
        referredById: 'ref_1',
        loyaltyLevel: {
          discount: 0,
        },
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        isActive: true,
        expiresAt: null,
        promoCode: { code: 'MOJO30' },
      });
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validateForReservation.mockRejectedValueOnce(
        new BadRequestException('Срок действия промокода истёк'),
      );

      await service.createWithBalance('user_1', 'product_1');

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(promoCodesService.reserveForOrder).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            promoCode: null,
            promoCodeSource: null,
          }),
        }),
      );
    });

    it('consume-ит auto-promo reservation после successful purchase', async () => {
      const { service, prisma } = makeService({
        promoCode: 'PROMO10',
        promoCodeSource: PromoCodeSource.REFERRAL_LINK_AUTO,
        user: {
          id: 'user_1',
          email: 'user@example.com',
          telegramId: null,
          totalSpent: 10000,
          referralLinkId: 'link_1',
          loyaltyLevel: {
            cashbackPercent: 10,
          },
          referredById: 'ref_1',
        },
      });

      await service.fulfillOrder('order_1');

      const promoCodesService = (service as any).promoCodesService;
      expect(promoCodesService.consumeReservation).toHaveBeenCalledWith(
        'order_1',
        expect.anything(),
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('не делает побочных cleanup-мутаций после successful first purchase с manual promo', async () => {
      const { service, prisma } = makeService({
        promoCode: 'MANUAL10',
        promoCodeSource: PromoCodeSource.MANUAL,
        user: {
          id: 'user_1',
          email: 'user@example.com',
          telegramId: null,
          totalSpent: 10000,
          referralLinkId: 'link_1',
          loyaltyLevel: {
            cashbackPercent: 10,
          },
          referredById: 'ref_1',
        },
      });

      await service.fulfillOrder('order_1');

      const promoCodesService = (service as any).promoCodesService;
      expect(promoCodesService.consumeReservation).toHaveBeenCalledWith(
        'order_1',
        expect.anything(),
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('create резервирует manual promo внутри order transaction вместо eager use()', async () => {
      const { service, prisma } = makeService();
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validateForReservation.mockResolvedValue({
        valid: true,
        promoId: 'promo_manual_1',
        code: 'MANUAL10',
        discountPercent: 10,
      });

      await service.create('user_1', 'product_1', 1, 0, undefined, 'manual10');

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            promoCode: 'MANUAL10',
            promoCodeSource: PromoCodeSource.MANUAL,
          }),
        }),
      );
      expect(promoCodesService.reserveForOrder).toHaveBeenCalledWith(
        'MANUAL10',
        'user_1',
        'order_1',
        'MANUAL',
        expect.anything(),
      );
    });

    it('не помечает order completed, если durable auto-promo consume падает', async () => {
      const { service, prisma } = makeService({
        promoCode: 'PROMO10',
        promoCodeSource: PromoCodeSource.REFERRAL_LINK_AUTO,
        user: {
          id: 'user_1',
          email: 'user@example.com',
          telegramId: null,
          totalSpent: 10000,
          referralLinkId: 'link_1',
          loyaltyLevel: {
            cashbackPercent: 10,
          },
          referredById: 'ref_1',
        },
      });
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.consumeReservation.mockRejectedValueOnce(new Error('db down'));

      await expect(service.fulfillOrder('order_1')).rejects.toThrow('db down');

      expect(prisma.order.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: 'order_1' },
          data: expect.objectContaining({
            status: OrderStatus.PROCESSING,
            errorMessage: 'Provider issuance succeeded, local finalize failed: db down',
          }),
        }),
      );
    });

    it('createWithBalance release-ит auto-promo reservation внутри failure transaction path', async () => {
      const { service, prisma, usersService, esimProviderService } = makeService();
      usersService.findById.mockResolvedValue({
        id: 'user_1',
        balance: 1000,
        bonusBalance: 0,
        totalSpent: 10000,
        referralLinkId: 'link_1',
        referredById: 'ref_1',
        loyaltyLevel: {
          discount: 0,
        },
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        isActive: true,
        expiresAt: null,
        promoCode: { code: 'PARTNER10' },
      });
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validateForReservation.mockResolvedValue({
        valid: true,
        promoId: 'promo_partner_1',
        code: 'PARTNER10',
        discountPercent: 10,
      });
      esimProviderService.purchaseEsim.mockRejectedValue(new Error('provider down'));

      await expect(
        service.createWithBalance('user_1', 'product_1'),
      ).rejects.toThrow('Покупка не выполнена');

      expect(promoCodesService.releaseReservation).toHaveBeenCalledWith(
        'order_1',
        expect.anything(),
      );
    });

    it('createWithBalance не делает refund, если provider purchase уже успешен, а local finalize упал', async () => {
      const { service, prisma } = makeService();
      const finalizedFailure = new Error('db down during complete');
      prisma.order.update.mockRejectedValueOnce(finalizedFailure).mockResolvedValueOnce({
        ...makeOrder({
          status: OrderStatus.PROCESSING,
          providerOrderId: 'provider-order-1',
          providerResponse: { order_id: 'provider-order-1' },
          iccid: 'iccid-1',
          qrCode: 'qr',
          activationCode: 'act-1',
          errorMessage: 'Provider issuance succeeded, local finalize failed: db down during complete',
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.SUCCEEDED,
              amount: 100,
              paymentProvider: 'balance',
              paymentMethod: 'balance',
              metadata: {},
            },
          ],
        }),
      });

      await expect(service.createWithBalance('user_1', 'product_1')).rejects.toThrow(
        'db down during complete',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.transaction.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: TransactionType.REFUND }),
        }),
      );
    });
  });

  describe('bonus spending / minPayout', () => {
    it('разрешает тратить cashback независимо от minPayout', async () => {
      const { service, prisma } = makeService();
      prisma.transaction.findMany.mockImplementation(({ where }: any) => {
        if (where?.status === TransactionStatus.PENDING) return Promise.resolve([]);
        return Promise.resolve([
          {
            type: TransactionType.BONUS_ACCRUAL,
            status: TransactionStatus.SUCCEEDED,
            amount: 120,
            metadata: { source: 'loyalty_cashback' },
          },
          {
            type: TransactionType.REFERRAL_BONUS,
            status: TransactionStatus.SUCCEEDED,
            amount: 200,
            metadata: {},
          },
        ]);
      });

      const order = await service.create('user_1', 'product_1', 1, 80);

      expect(Number(order.bonusUsed)).toBe(80);
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_1',
          orderId: 'order_1',
          type: TransactionType.BONUS_SPENT,
          status: TransactionStatus.PENDING,
          metadata: {
            source: 'order_bonus_hold',
            spentFromReferral: 0,
            spentFromCashback: 80,
          },
        }),
      });
    });

    it('не даёт тратить referral bonus ниже minPayout', async () => {
      const { service, prisma } = makeService();
      prisma.transaction.findMany.mockImplementation(({ where }: any) => {
        if (where?.status === TransactionStatus.PENDING) return Promise.resolve([]);
        return Promise.resolve([
          {
            type: TransactionType.REFERRAL_BONUS,
            status: TransactionStatus.SUCCEEDED,
            amount: 200,
            metadata: {},
          },
        ]);
      });

      const order = await service.create('user_1', 'product_1', 1, 80);

      expect(Number(order.bonusUsed)).toBe(0);
      expect(prisma.transaction.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: TransactionType.BONUS_SPENT,
          }),
        }),
      );
    });

    it('разрешает тратить referral bonus от minPayout и выше', async () => {
      const { service, prisma, systemSettingsService } = makeService();
      systemSettingsService.getReferralSettings.mockResolvedValue({
        bonusPercent: 5,
        minPayout: 300,
        enabled: true,
      });
      prisma.transaction.findMany.mockImplementation(({ where }: any) => {
        if (where?.status === TransactionStatus.PENDING) return Promise.resolve([]);
        return Promise.resolve([
          {
            type: TransactionType.REFERRAL_BONUS,
            status: TransactionStatus.SUCCEEDED,
            amount: 400,
            metadata: {},
          },
        ]);
      });

      const order = await service.create('user_1', 'product_1', 1, 80);

      expect(Number(order.bonusUsed)).toBe(80);
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: TransactionType.BONUS_SPENT,
          metadata: {
            source: 'order_bonus_hold',
            spentFromReferral: 80,
            spentFromCashback: 0,
          },
        }),
      });
    });

    it('корректно делит mixed wallet между cashback и referral part', async () => {
      const { service, prisma, systemSettingsService } = makeService();
      systemSettingsService.getReferralSettings.mockResolvedValue({
        bonusPercent: 5,
        minPayout: 300,
        enabled: true,
      });
      prisma.transaction.findMany.mockImplementation(({ where }: any) => {
        if (where?.status === TransactionStatus.PENDING) return Promise.resolve([]);
        return Promise.resolve([
          {
            type: TransactionType.BONUS_ACCRUAL,
            status: TransactionStatus.SUCCEEDED,
            amount: 40,
            metadata: { source: 'loyalty_cashback' },
          },
          {
            type: TransactionType.REFERRAL_BONUS,
            status: TransactionStatus.SUCCEEDED,
            amount: 500,
            metadata: {},
          },
        ]);
      });

      await service.create('user_1', 'product_1', 1, 70);

      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: TransactionType.BONUS_SPENT,
          metadata: {
            source: 'order_bonus_hold',
            spentFromReferral: 30,
            spentFromCashback: 40,
          },
        }),
      });
    });

    it('create резервирует текущий promo referral link', async () => {
      const { service, prisma, usersService } = makeService();
      usersService.findById.mockResolvedValue({
        id: 'user_1',
        balance: 1000,
        bonusBalance: 100,
        totalSpent: 10000,
        referralLinkId: 'link_1',
        referredById: 'ref_1',
        loyaltyLevel: {
          discount: 0,
        },
      });
      prisma.referralLink.findUnique.mockResolvedValue({
        id: 'link_1',
        isActive: true,
        expiresAt: null,
        promoCode: { code: 'PARTNER10' },
      });
      const promoCodesService = (service as any).promoCodesService;
      promoCodesService.validateForReservation.mockResolvedValue({
        valid: true,
        promoId: 'promo_partner_1',
        code: 'PARTNER10',
        discountPercent: 10,
      });

      const order = await service.create('user_1', 'product_1', 1, 0);

      expect(promoCodesService.reserveForOrder).toHaveBeenCalledWith(
        'PARTNER10',
        'user_1',
        'order_1',
        'REFERRAL_LINK_AUTO',
        expect.anything(),
      );
      expect(Number(order.promoDiscount)).toBe(10);
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            promoCode: 'PARTNER10',
            promoCodeSource: PromoCodeSource.REFERRAL_LINK_AUTO,
          }),
        }),
      );
    });

    it('учитывает pending bonus hold как уже зарезервированный и не даёт потратить его повторно', async () => {
      const { service, prisma, systemSettingsService } = makeService();
      systemSettingsService.getReferralSettings.mockResolvedValue({
        bonusPercent: 5,
        minPayout: 300,
        enabled: true,
      });
      prisma.transaction.findMany.mockImplementation(({ where }: any) => {
        if (where?.status === TransactionStatus.PENDING) return Promise.resolve([]);
        return Promise.resolve([
          {
            type: TransactionType.REFERRAL_BONUS,
            status: TransactionStatus.SUCCEEDED,
            amount: 500,
            metadata: {},
          },
          {
            type: TransactionType.BONUS_SPENT,
            status: TransactionStatus.PENDING,
            amount: 400,
            metadata: {
              source: 'order_bonus_hold',
              spentFromReferral: 400,
              spentFromCashback: 0,
            },
          },
        ]);
      });

      const order = await service.create('user_1', 'product_1', 1, 200);

      expect(Number(order.bonusUsed)).toBe(0);
    });

    it('cancels stale pending holds and corresponding pending orders before reusing bonuses', async () => {
      const { service, prisma } = makeService();
      prisma.transaction.findMany.mockImplementation(({ where }: any) => {
        if (where?.status === TransactionStatus.PENDING) {
          return Promise.resolve([
            {
              id: 'hold_1',
              orderId: 'order_stale',
              order: {
                id: 'order_stale',
                status: OrderStatus.PENDING,
                createdAt: new Date(Date.now() - 31 * 60 * 1000),
              },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      await service.findByUser('user_1');

      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['hold_1'] } },
        data: {
          status: TransactionStatus.CANCELLED,
          metadata: {
            releaseReason: 'payment_session_expired',
          },
        },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order_stale' },
        data: {
          status: OrderStatus.CANCELLED,
          errorMessage: 'Payment session expired',
        },
      });
      const promoCodesService = (service as any).promoCodesService;
      expect(promoCodesService.releaseReservation).toHaveBeenCalledWith(
        'order_stale',
        expect.anything(),
      );
    });

    it('cancels stale pending orders even without bonus hold', async () => {
      const { service, prisma } = makeService();
      prisma.order.findMany.mockImplementation(({ where }: any) => {
        if (where?.status === OrderStatus.PENDING) {
          return Promise.resolve([{ id: 'order_card_stale' }]);
        }
        return Promise.resolve([]);
      });
      prisma.transaction.findMany.mockImplementation(({ where }: any) => {
        if (where?.status === TransactionStatus.PENDING) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      await service.findByUser('user_1');

      expect(prisma.transaction.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          orderId: 'order_card_stale',
          type: TransactionType.PAYMENT,
          status: TransactionStatus.PENDING,
        },
        data: {
          status: TransactionStatus.CANCELLED,
          metadata: {
            releaseReason: 'payment_session_expired',
          },
        },
      });
      expect(prisma.transaction.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          orderId: 'order_card_stale',
          type: TransactionType.BONUS_SPENT,
          status: TransactionStatus.PENDING,
        },
        data: {
          status: TransactionStatus.CANCELLED,
          metadata: {
            releaseReason: 'payment_session_expired',
          },
        },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order_card_stale' },
        data: {
          status: OrderStatus.CANCELLED,
          errorMessage: 'Payment session expired',
        },
      });
    });
  });

  describe('reconciliation visibility', () => {
    it('includes issued-but-finalize-failed processing orders in needs_attention', async () => {
      const { service, prisma } = makeService();
      prisma.order.findMany.mockResolvedValue([
        makeOrder({
          id: 'order_processing_issue',
          status: OrderStatus.PROCESSING,
          providerOrderId: 'provider-order-1',
          providerResponse: { order_id: 'provider-order-1' },
          iccid: 'iccid-1',
          qrCode: 'qr',
          activationCode: 'act-1',
          errorMessage: 'Provider issuance succeeded, local finalize failed: db down during complete',
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.SUCCEEDED,
              amount: 100,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'card',
              metadata: {},
            },
          ],
        }),
      ]);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.findAll({ reconciliation: 'needs_attention' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ status: OrderStatus.PROCESSING }),
            ]),
          }),
        }),
      );
      expect(result.data[0].reconciliation).toEqual({
        needsAttention: true,
        category: 'issued_but_finalize_failed',
        refunded: false,
        paymentProvider: 'cloudpayments',
        paymentMethod: 'card',
        paymentAmount: 100,
        lastError: 'Provider issuance succeeded, local finalize failed: db down during complete',
        repeatChargeAttemptId: null,
        repeatChargeAttemptStatus: null,
        providerReasonCode: null,
        providerMessage: null,
        ambiguousReason: null,
      });
    });

    it('includes pending orders with successful payment in needs_attention', async () => {
      const { service, prisma } = makeService();
      prisma.order.findMany.mockResolvedValue([
        makeOrder({
          id: 'order_pending_paid',
          status: OrderStatus.PENDING,
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.SUCCEEDED,
              amount: 100,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'card',
              metadata: {},
            },
          ],
        }),
      ]);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.findAll({ reconciliation: 'needs_attention' });

      expect(result.data[0].reconciliation).toEqual({
        needsAttention: true,
        category: 'pending_paid_recovery',
        refunded: false,
        paymentProvider: 'cloudpayments',
        paymentMethod: 'card',
        paymentAmount: 100,
        lastError: null,
        repeatChargeAttemptId: null,
        repeatChargeAttemptStatus: null,
        providerReasonCode: null,
        providerMessage: null,
        ambiguousReason: null,
      });
    });

    it('includes ambiguous saved-card repeat charge orders in needs_attention', async () => {
      const { service, prisma } = makeService();
      prisma.order.findMany.mockResolvedValue([
        makeOrder({
          id: 'order_ambiguous',
          status: OrderStatus.PENDING,
          errorMessage: null,
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.PENDING,
              amount: 100,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'saved_card_token',
              metadata: {
                repeatCharge: true,
              },
            },
          ],
          repeatChargeAttempt: {
            id: 'attempt_1',
            status: 'AMBIGUOUS',
            providerReasonCode: null,
            providerMessage: 'Saved card charge failed: transport timeout',
            ambiguousReason: 'timeout',
          },
        }),
      ]);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.findAll({ reconciliation: 'needs_attention' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                status: OrderStatus.FAILED,
                transactions: {
                  some: {
                    type: TransactionType.PAYMENT,
                    status: TransactionStatus.SUCCEEDED,
                  },
                },
              },
              {
                repeatChargeAttempt: {
                  is: {
                    status: 'AMBIGUOUS',
                  },
                },
              },
            ]),
          }),
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(result.data[0].reconciliation).toEqual({
        needsAttention: true,
        category: 'repeat_charge_ambiguous',
        refunded: false,
        paymentProvider: 'cloudpayments',
        paymentMethod: 'saved_card_token',
        paymentAmount: 100,
        lastError: 'Saved card charge failed: transport timeout',
        repeatChargeAttemptId: 'attempt_1',
        repeatChargeAttemptStatus: 'AMBIGUOUS',
        providerReasonCode: null,
        providerMessage: 'Saved card charge failed: transport timeout',
        ambiguousReason: 'timeout',
      });
    });

    it('preserves database total for needs_attention pagination metadata', async () => {
      const { service, prisma } = makeService();
      prisma.order.findMany.mockResolvedValue([
        makeOrder({
          id: 'order_page_1',
          status: OrderStatus.PENDING,
          transactions: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.PENDING,
              amount: 100,
              paymentProvider: 'cloudpayments',
              paymentMethod: 'saved_card_token',
              metadata: {},
            },
          ],
          repeatChargeAttempt: {
            id: 'attempt_page_1',
            status: 'AMBIGUOUS',
            providerReasonCode: null,
            providerMessage: 'pending review',
            ambiguousReason: 'timeout',
          },
        }),
      ]);
      prisma.order.count.mockResolvedValue(3);

      const result = await service.findAll({
        reconciliation: 'needs_attention',
        page: 1,
        limit: 1,
      });

      expect(result.meta).toMatchObject({
        total: 3,
        page: 1,
        limit: 1,
        totalPages: 3,
      });
    });
  });
});
