import { TransactionStatus, TransactionType, OrderStatus } from '@prisma/client';
import axios from 'axios';
import { PaymentsService } from './payments.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeService() {
  const prisma = {
    order: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    cloudPaymentsCardToken: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    repeatChargeAttempt: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          update: jest.fn().mockResolvedValue(undefined),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: prisma.transaction.create,
          findFirst: prisma.transaction.findFirst,
        },
        order: {
          findUnique: prisma.order.findUnique,
          update: jest.fn().mockResolvedValue(undefined),
        },
        cloudPaymentsCardToken: {
          update: jest.fn().mockResolvedValue(undefined),
        },
        repeatChargeAttempt: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(async ({ data }: any) => ({
            id: 'attempt_1',
            orderId: data.orderId,
            userId: data.userId,
            savedCardId: data.savedCardId,
            status: data.status,
            idempotencyKey: data.idempotencyKey,
            cloudPaymentsTransactionId: null,
            providerReasonCode: null,
            providerMessage: null,
            ambiguousReason: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            finishedAt: null,
          })),
          update: jest.fn().mockResolvedValue(undefined),
        },
      }),
    ),
  };

  const ordersService = {
    assertOwnership: jest.fn(),
    releaseBonusSpendHold: jest.fn().mockResolvedValue(undefined),
    markOrderCancelled: jest.fn().mockResolvedValue(undefined),
    fulfillOrder: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(),
  };

  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'CLOUDPAYMENTS_PUBLIC_ID') return 'pk_test';
      if (key === 'CLOUDPAYMENTS_API_SECRET') return 'sk_test';
      if (key === 'DEBUG_SENSITIVE_LOGS') return 'false';
      if (key === 'ROBOKASSA_TEST_MODE') return 'true';
      return '';
    }),
  };

  const telegramNotification = {
    sendTextNotification: jest.fn(),
    sendPaymentSuccessNotification: jest.fn(),
  };

  const pushService = {
    sendPaymentSuccess: jest.fn().mockResolvedValue(undefined),
  };

  const service = new PaymentsService(
    prisma as any,
    ordersService as any,
    configService as any,
    telegramNotification as any,
    pushService as any,
  );

  return { service, prisma, ordersService, pushService };
}

describe('PaymentsService saved card repeat charge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active saved card summary for current user', async () => {
    const { service, prisma } = makeService();
    prisma.cloudPaymentsCardToken.findFirst.mockResolvedValue({
      id: 'card_1',
      userId: 'user_1',
      accountId: 'user_1',
      cloudPaymentsToken: 'tk_1',
      cardMask: '4242 42****** 4242',
      cardBrand: 'Visa',
      expMonth: 12,
      expYear: 2030,
      isActive: true,
      lastUsedAt: null,
    });

    const result = await service.getActiveSavedCard('user_1');

    expect(result).toEqual({
      id: 'card_1',
      cardMask: '4242 42****** 4242',
      cardBrand: 'Visa',
      expMonth: 12,
      expYear: 2030,
      isActive: true,
      lastUsedAt: null,
    });
  });

  it('falls back to widget and cancels order when no active saved card exists', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.PENDING,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      product: { name: 'Japan 10 GB', country: 'JP', dataAmount: '10 GB' },
      user: { id: 'user_1', email: 'user@example.com' },
      transactions: [],
    });
    prisma.cloudPaymentsCardToken.findFirst.mockResolvedValue(null);
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.CANCELLED,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      createdAt: new Date(),
      completedAt: null,
    });

    const result = await service.chargeOrderWithSavedCard('user_1', 'order_1');

    expect(ordersService.markOrderCancelled).toHaveBeenCalledWith(
      'order_1',
      {
        errorMessage: 'Saved card unavailable',
      },
      'saved_card_fallback',
      expect.anything(),
    );
    expect(result.success).toBe(false);
    expect(result.chargeState).toBe('declined');
    expect(result.fallbackToWidget).toBe(true);
    expect(result.repeatChargeAttemptId).toBeNull();
    expect(result.savedCard).toBeNull();
  });

  it('charges order with saved card and fulfills on provider success', async () => {
    const { service, prisma, ordersService, pushService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.PENDING,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      product: { name: 'Japan 10 GB', country: 'JP', dataAmount: '10 GB' },
      user: { id: 'user_1', email: 'user@example.com' },
      transactions: [],
    });
    prisma.transaction.create.mockResolvedValue({
      id: 'tx_1',
      orderId: 'order_1',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
    });
    prisma.cloudPaymentsCardToken.findFirst.mockResolvedValue({
      id: 'card_1',
      userId: 'user_1',
      accountId: 'user_1',
      cloudPaymentsToken: 'tk_1',
      cardMask: '4242 42****** 4242',
      cardBrand: 'Visa',
      expMonth: 12,
      expYear: 2030,
      isActive: true,
      lastUsedAt: null,
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        Success: true,
        Message: null,
        Model: {
          TransactionId: 777,
          ReasonCode: 0,
          CardHolderMessage: 'Оплата успешно проведена',
        },
      },
    } as any);
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.COMPLETED,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      createdAt: new Date(),
      completedAt: new Date(),
    });

    const result = await service.chargeOrderWithSavedCard('user_1', 'order_1');

    expect(mockedAxios.post).toHaveBeenCalled();
    expect(ordersService.fulfillOrder).toHaveBeenCalledWith('order_1');
    expect(pushService.sendPaymentSuccess).toHaveBeenCalledWith('user_1', {
      orderId: 'order_1',
      productName: 'Japan 10 GB',
      country: 'JP',
      dataAmount: '10 GB',
      price: 100,
    });
    expect(result.success).toBe(true);
    expect(result.chargeState).toBe('succeeded');
    expect(result.fallbackToWidget).toBe(false);
    expect(result.repeatChargeAttemptId).toBe('attempt_1');
  });

  it('does not call provider again when repeat charge attempt is already in progress', async () => {
    const { service, prisma } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.PENDING,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      product: { name: 'Japan 10 GB', country: 'JP', dataAmount: '10 GB' },
      user: { id: 'user_1', email: 'user@example.com' },
      transactions: [],
    });
    prisma.cloudPaymentsCardToken.findFirst.mockResolvedValue({
      id: 'card_1',
      userId: 'user_1',
      accountId: 'user_1',
      cloudPaymentsToken: 'tk_1',
      cardMask: '4242 42****** 4242',
      cardBrand: 'Visa',
      expMonth: 12,
      expYear: 2030,
      isActive: true,
      lastUsedAt: null,
    });
    prisma.$transaction.mockResolvedValue({
      created: false,
      paymentTxId: 'tx_1',
      attempt: {
        id: 'attempt_1',
        orderId: 'order_1',
        userId: 'user_1',
        savedCardId: 'card_1',
        status: 'IN_PROGRESS',
        idempotencyKey: 'repeat-charge-order_1',
        cloudPaymentsTransactionId: null,
        providerReasonCode: null,
        providerMessage: null,
        ambiguousReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
      },
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.PENDING,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      createdAt: new Date(),
      completedAt: null,
    });

    const result = await service.chargeOrderWithSavedCard('user_1', 'order_1');

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.chargeState).toBe('in_progress');
    expect(result.fallbackToWidget).toBe(false);
    expect(result.repeatChargeAttemptId).toBe('attempt_1');
    expect(result.message).toContain('уже обрабатывается');
  });

  it('keeps order pending on transport timeout and does not fallback to widget', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.PENDING,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      product: { name: 'Japan 10 GB', country: 'JP', dataAmount: '10 GB' },
      user: { id: 'user_1', email: 'user@example.com' },
      transactions: [],
    });
    prisma.cloudPaymentsCardToken.findFirst.mockResolvedValue({
      id: 'card_1',
      userId: 'user_1',
      accountId: 'user_1',
      cloudPaymentsToken: 'tk_1',
      cardMask: '4242 42****** 4242',
      cardBrand: 'Visa',
      expMonth: 12,
      expYear: 2030,
      isActive: true,
      lastUsedAt: null,
    });
    prisma.transaction.create.mockResolvedValue({
      id: 'tx_1',
      orderId: 'order_1',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.PENDING,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      createdAt: new Date(),
      completedAt: null,
    });
    mockedAxios.post.mockRejectedValue({ code: 'ECONNABORTED' });

    const result = await service.chargeOrderWithSavedCard('user_1', 'order_1');

    expect(result.success).toBe(false);
    expect(result.chargeState).toBe('ambiguous');
    expect(result.fallbackToWidget).toBe(false);
    expect(result.repeatChargeAttemptId).toBe('attempt_1');
    expect(result.message).toContain('еще уточняется');
    expect(ordersService.markOrderCancelled).not.toHaveBeenCalled();
  });

  it('returns declined state and widget fallback on confirmed provider decline', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.PENDING,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      product: { name: 'Japan 10 GB', country: 'JP', dataAmount: '10 GB' },
      user: { id: 'user_1', email: 'user@example.com' },
      transactions: [],
    });
    prisma.cloudPaymentsCardToken.findFirst.mockResolvedValue({
      id: 'card_1',
      userId: 'user_1',
      accountId: 'user_1',
      cloudPaymentsToken: 'tk_1',
      cardMask: '4242 42****** 4242',
      cardBrand: 'Visa',
      expMonth: 12,
      expYear: 2030,
      isActive: true,
      lastUsedAt: null,
    });
    prisma.transaction.create.mockResolvedValue({
      id: 'tx_1',
      orderId: 'order_1',
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
    });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      productId: 'product_1',
      status: OrderStatus.CANCELLED,
      quantity: 1,
      periodNum: null,
      productPrice: 100,
      discount: 0,
      promoCode: null,
      promoDiscount: 0,
      bonusUsed: 0,
      totalAmount: 100,
      parentOrderId: null,
      topupPackageCode: null,
      createdAt: new Date(),
      completedAt: null,
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        Success: false,
        Message: 'Declined',
        Model: {
          ReasonCode: 5051,
          CardHolderMessage: 'Недостаточно средств',
        },
      },
    } as any);

    const result = await service.chargeOrderWithSavedCard('user_1', 'order_1');

    expect(result.success).toBe(false);
    expect(result.chargeState).toBe('declined');
    expect(result.fallbackToWidget).toBe(true);
    expect(result.repeatChargeAttemptId).toBe('attempt_1');
    expect(result.message).toContain('Откройте оплату новой картой');
    expect(ordersService.markOrderCancelled).toHaveBeenCalledWith(
      'order_1',
      {
        errorMessage: 'Saved card charge failed: Недостаточно средств',
      },
      'saved_card_fallback',
      expect.anything(),
    );
  });

  it('redacts cloudpayments metadata in user transaction responses', async () => {
    const { service, prisma } = makeService();
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx_1',
        userId: 'user_1',
        orderId: 'order_1',
        type: TransactionType.PAYMENT,
        status: TransactionStatus.SUCCEEDED,
        amount: 100,
        paymentProvider: 'cloudpayments',
        paymentId: 'cp_tx_1',
        paymentMethod: 'card',
        metadata: {
          source: 'cloudpayments_webhook',
          transactionId: 'cp_tx_1',
          cardMask: '**** 4242',
          Token: 'raw-token-should-not-leak',
          CardLastFour: '4242',
        },
        createdAt: new Date(),
        order: null,
      },
    ]);

    const result = await service.findByUser('user_1');

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual({
      source: 'cloudpayments_webhook',
      purpose: null,
      status: null,
      invoiceId: null,
      transactionId: 'cp_tx_1',
      accountId: null,
      amount: null,
      currency: null,
      cardMask: '**** 4242',
      cardBrand: null,
      reasonCode: null,
      reason: null,
      repeatCharge: null,
      repeatChargeAttemptId: null,
      savedCardId: null,
      ambiguousReason: null,
      testMode: null,
      parentOrderId: null,
    });
  });
});
