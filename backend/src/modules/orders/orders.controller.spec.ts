import { ForbiddenException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';

function makeOrderResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    userId: 'user_1',
    productId: 'product_1',
    status: OrderStatus.COMPLETED,
    quantity: 1,
    periodNum: null,
    productPrice: 100,
    discount: 0,
    promoDiscount: 0,
    bonusUsed: 0,
    totalAmount: 100,
    qrCode: 'qr',
    iccid: 'iccid-1',
    activationCode: 'activation',
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    completedAt: new Date('2026-07-10T00:01:00.000Z'),
    esimStatus: 'ACTIVE',
    smdpAddress: 'smdp.example',
    activatedAt: null,
    expiresAt: null,
    parentOrderId: null,
    topupPackageCode: null,
    providerOrderId: 'provider-order-secret',
    providerResponse: { raw: 'provider-secret' },
    user: { email: 'owner@example.com', authProvider: 'google' },
    transactions: [{ paymentId: 'payment-secret', metadata: { token: 'secret' } }],
    repeatChargeAttempt: { savedCardId: 'card-secret', idempotencyKey: 'secret' },
    product: {
      id: 'product_1',
      country: 'JP',
      name: 'Japan 10 GB',
      dataAmount: '10 GB',
      validityDays: 30,
      supportTopup: true,
      providerId: 'provider-plan-secret',
      providerPrice: 42,
    },
    ...overrides,
  };
}

describe('OrdersController', () => {
  const ordersService = {
    findAll: jest.fn(),
    cancelOrder: jest.fn(),
    retryFulfillment: jest.fn(),
    recoverPendingPaidOrder: jest.fn(),
    finalizeReconciledOrder: jest.fn(),
    retryCompletionAccounting: jest.fn(),
    assertOwnership: jest.fn(),
    findById: jest.fn(),
    findByUser: jest.fn(),
    checkNewOrders: jest.fn(),
    createWithBalance: jest.fn(),
    create: jest.fn(),
    previewPricing: jest.fn(),
    markOrderPaid: jest.fn(),
    fulfillOrder: jest.fn(),
  };

  const usersService = {
    updateEmail: jest.fn(),
  };

  const controller = new OrdersController(ordersService as any, usersService as any);

  beforeEach(() => jest.clearAllMocks());

  it('findOne проверяет ownership для user token', async () => {
    ordersService.findById.mockResolvedValue(makeOrderResult());

    const result = await controller.findOne('order_1', { id: 'user_1', type: 'user' });

    expect(ordersService.assertOwnership).toHaveBeenCalledWith('order_1', 'user_1');
    expect(ordersService.findById).toHaveBeenCalledWith('order_1');
    expect(result).not.toHaveProperty('user');
    expect(result).not.toHaveProperty('transactions');
    expect(result).not.toHaveProperty('repeatChargeAttempt');
    expect(result).not.toHaveProperty('providerResponse');
    expect(result.product).not.toHaveProperty('providerId');
    expect(result.product).not.toHaveProperty('providerPrice');
  });

  it('findOne сохраняет диагностический payload только для admin', async () => {
    const rawOrder = makeOrderResult();
    ordersService.findById.mockResolvedValue(rawOrder);

    const result = await controller.findOne('order_1', { id: 'admin_1', type: 'admin' });

    expect(ordersService.assertOwnership).not.toHaveBeenCalled();
    expect(result).toBe(rawOrder);
  });

  it('findByUser очищает каждый order для owner', async () => {
    ordersService.findByUser.mockResolvedValue([makeOrderResult()]);

    const result = await controller.findByUser('user_1', { id: 'user_1', type: 'user' });

    expect(result[0]).not.toHaveProperty('transactions');
    expect(result[0]).not.toHaveProperty('user');
    expect(result[0].product).not.toHaveProperty('providerId');
  });

  it('checkNewOrders очищает latestOrder для owner', async () => {
    ordersService.checkNewOrders.mockResolvedValue({
      hasNewOrders: true,
      latestOrder: makeOrderResult(),
    });

    const result = await controller.checkNewOrders('user_1', { id: 'user_1', type: 'user' });

    expect(result.latestOrder).not.toHaveProperty('transactions');
    expect(result.latestOrder).not.toHaveProperty('user');
    expect(result.latestOrder.product).not.toHaveProperty('providerId');
  });

  it('findByUser запрещает доступ к чужому userId', async () => {
    await expect(
      controller.findByUser('user_2', { id: 'user_1', type: 'user' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('checkNewOrders запрещает доступ к чужому userId', async () => {
    await expect(
      controller.checkNewOrders('user_2', { id: 'user_1', type: 'user' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('quote использует previewPricing для текущего пользователя', async () => {
    ordersService.previewPricing.mockResolvedValue({ totalAmount: 95 });

    const result = await controller.quote(
      { id: 'user_1', type: 'user' },
      { productId: 'product_1', periodNum: 7, promoCode: 'SALE10' },
    );

    expect(ordersService.previewPricing).toHaveBeenCalledWith('user_1', 'product_1', {
      quantity: undefined,
      useBonuses: undefined,
      periodNum: 7,
      promoCode: 'SALE10',
    });
    expect(result).toEqual({ totalAmount: 95 });
  });

  it('fulfillFree позволяет владельцу выполнить бесплатный заказ', async () => {
    ordersService.findById.mockResolvedValue({ id: 'order_1', totalAmount: 0 });
    ordersService.markOrderPaid.mockResolvedValue({ id: 'order_1', status: OrderStatus.PAID });
    ordersService.fulfillOrder.mockResolvedValue(makeOrderResult({ totalAmount: 0 }));

    const result = await controller.fulfillFree('order_1', { id: 'user_1', type: 'user' });

    expect(ordersService.assertOwnership).toHaveBeenCalledWith('order_1', 'user_1');
    expect(ordersService.markOrderPaid).toHaveBeenCalledWith('order_1');
    expect(result).not.toHaveProperty('user');
    expect(result).not.toHaveProperty('transactions');
    expect(result).not.toHaveProperty('providerResponse');
  });

  it('retryFulfillment вызывает admin retry path', async () => {
    ordersService.retryFulfillment.mockResolvedValue({ id: 'order_1', status: OrderStatus.PROCESSING });

    const result = await controller.retryFulfillment('order_1');

    expect(ordersService.retryFulfillment).toHaveBeenCalledWith('order_1');
    expect(result).toEqual({ id: 'order_1', status: OrderStatus.PROCESSING });
  });

  it('recoverPaidPending вызывает admin paid-pending recovery path', async () => {
    ordersService.recoverPendingPaidOrder.mockResolvedValue({ id: 'order_1', status: OrderStatus.PROCESSING });

    const result = await controller.recoverPaidPending('order_1');

    expect(ordersService.recoverPendingPaidOrder).toHaveBeenCalledWith('order_1');
    expect(result).toEqual({ id: 'order_1', status: OrderStatus.PROCESSING });
  });

  it('finalizeReconcile вызывает admin reconcile finalize path', async () => {
    ordersService.finalizeReconciledOrder.mockResolvedValue({ id: 'order_1', status: OrderStatus.COMPLETED });

    const result = await controller.finalizeReconcile('order_1');

    expect(ordersService.finalizeReconciledOrder).toHaveBeenCalledWith('order_1');
    expect(result).toEqual({ id: 'order_1', status: OrderStatus.COMPLETED });
  });

  it('retryCompletionAccounting вызывает admin accounting retry path', async () => {
    ordersService.retryCompletionAccounting.mockResolvedValue({ orderId: 'order_1', status: 'APPLIED' });

    const result = await controller.retryCompletionAccounting('order_1');

    expect(ordersService.retryCompletionAccounting).toHaveBeenCalledWith('order_1');
    expect(result).toEqual({ orderId: 'order_1', status: 'APPLIED' });
  });
});
