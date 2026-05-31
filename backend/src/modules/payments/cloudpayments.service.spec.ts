import { OrderStatus } from '@prisma/client';
import { CloudPaymentsService } from './cloudpayments.service';

function makeService() {
  const prisma = {
    order: {
      findUnique: jest.fn(),
    },
    transaction: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    cloudPaymentsCardToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn().mockResolvedValue(undefined),
        },
        cloudPaymentsCardToken: {
          findUnique: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          upsert: jest.fn().mockResolvedValue(undefined),
        },
        order: {
          update: jest.fn().mockResolvedValue(undefined),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    ),
  };

  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'CLOUDPAYMENTS_ENFORCE_HMAC') return 'true';
      return '';
    }),
  };

  const ordersService = {
    isExpiredPaymentSessionOrder: jest.fn(),
    expirePendingPaymentSession: jest.fn().mockResolvedValue(undefined),
    fulfillOrder: jest.fn().mockResolvedValue(undefined),
  };

  const telegramNotification = {
    sendTextNotification: jest.fn().mockResolvedValue(undefined),
  };

  const service = new CloudPaymentsService(
    prisma as any,
    configService as any,
    ordersService as any,
    telegramNotification as any,
  );

  return { service, prisma, ordersService };
}

describe('CloudPaymentsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('declines expired order on check with code 20 and expires the session', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      status: OrderStatus.PENDING,
      totalAmount: 100,
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
      errorMessage: null,
    });
    ordersService.isExpiredPaymentSessionOrder.mockReturnValue(true);

    const result = await service.handleCheck({
      InvoiceId: 'order_1',
      Amount: 100,
    });

    expect(ordersService.expirePendingPaymentSession).toHaveBeenCalledWith('order_1');
    expect(result).toEqual({ code: 20 });
  });

  it('revives expired cancelled order on late pay callback and acknowledges without inline fulfill', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      status: OrderStatus.CANCELLED,
      totalAmount: 100,
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
      errorMessage: 'Payment session expired',
      product: {
        name: 'Japan 10 GB',
        country: 'JP',
        dataAmount: '10 GB',
      },
      user: {
        id: 'user_1',
      },
    });
    prisma.transaction.findFirst.mockResolvedValue(null);
    ordersService.isExpiredPaymentSessionOrder.mockReturnValue(true);

    const result = await service.handlePay({
      InvoiceId: 'order_1',
      Amount: 100,
      TransactionId: 'cp_tx_1',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ordersService.fulfillOrder).not.toHaveBeenCalled();
    expect(result).toEqual({ code: 0 });
  });

  it('ignores pay callback for manually cancelled order', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      status: OrderStatus.CANCELLED,
      totalAmount: 100,
      createdAt: new Date(),
      errorMessage: 'Отменён администратором',
      product: {
        name: 'Japan 10 GB',
        country: 'JP',
        dataAmount: '10 GB',
      },
      user: {
        id: 'user_1',
      },
    });
    ordersService.isExpiredPaymentSessionOrder.mockReturnValue(false);

    const result = await service.handlePay({
      InvoiceId: 'order_1',
      Amount: 100,
      TransactionId: 'cp_tx_1',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ordersService.fulfillOrder).not.toHaveBeenCalled();
    expect(result).toEqual({ code: 0 });
  });

  it('does not schedule duplicate fulfillment when another callback already claimed the order', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      status: OrderStatus.PENDING,
      totalAmount: 100,
      createdAt: new Date(),
      errorMessage: null,
      product: {
        name: 'Japan 10 GB',
        country: 'JP',
        dataAmount: '10 GB',
      },
      user: {
        id: 'user_1',
      },
    });
    prisma.transaction.findFirst.mockResolvedValue(null);
    ordersService.isExpiredPaymentSessionOrder.mockReturnValue(false);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn().mockResolvedValue(undefined),
        },
        cloudPaymentsCardToken: {
          findUnique: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          upsert: jest.fn().mockResolvedValue(undefined),
        },
        order: {
          update: jest.fn().mockResolvedValue(undefined),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      }),
    );

    const result = await service.handlePay({
      InvoiceId: 'order_1',
      Amount: 100,
      TransactionId: 'cp_tx_1',
    });

    expect(ordersService.fulfillOrder).not.toHaveBeenCalled();
    expect(result).toEqual({ code: 0 });
  });

  it('rejects order webhook when AccountId does not match owner', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      status: OrderStatus.PENDING,
      totalAmount: 100,
      createdAt: new Date(),
      errorMessage: null,
    });
    ordersService.isExpiredPaymentSessionOrder.mockReturnValue(false);

    const result = await service.handleCheck({
      InvoiceId: 'order_1',
      Amount: 100,
      AccountId: 'user_2',
    });

    expect(result).toEqual({ code: 11 });
  });
});
