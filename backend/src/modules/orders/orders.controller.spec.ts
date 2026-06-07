import { ForbiddenException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';

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
    ordersService.findById.mockResolvedValue({ id: 'order_1' });

    await controller.findOne('order_1', { id: 'user_1', type: 'user' });

    expect(ordersService.assertOwnership).toHaveBeenCalledWith('order_1', 'user_1');
    expect(ordersService.findById).toHaveBeenCalledWith('order_1');
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
    ordersService.fulfillOrder.mockResolvedValue({ id: 'order_1', status: OrderStatus.COMPLETED });

    const result = await controller.fulfillFree('order_1', { id: 'user_1', type: 'user' });

    expect(ordersService.assertOwnership).toHaveBeenCalledWith('order_1', 'user_1');
    expect(ordersService.markOrderPaid).toHaveBeenCalledWith('order_1');
    expect(result).toEqual({ id: 'order_1', status: OrderStatus.COMPLETED });
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
