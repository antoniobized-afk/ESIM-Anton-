import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PaymentFulfillmentPickerService } from './payment-fulfillment-picker.service';

function makeService() {
  const prisma = {
    order: {
      findMany: jest.fn(),
    },
  };

  const ordersService = {
    fulfillOrder: jest.fn(),
  };

  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'PAYMENT_FULFILLMENT_PICKER_ENABLED') return 'true';
      if (key === 'PAYMENT_FULFILLMENT_PICKER_BATCH_SIZE') return '20';
      return undefined;
    }),
  };

  const service = new PaymentFulfillmentPickerService(
    prisma as any,
    ordersService as any,
    configService as any,
  );

  return { service, prisma, ordersService };
}

describe('PaymentFulfillmentPickerService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('picks paid orders and runs canonical fulfillment', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findMany.mockResolvedValue([
      { id: 'order_1', status: OrderStatus.PAID },
      { id: 'order_2', status: OrderStatus.PAID },
    ]);

    await service.pickPaidOrders();

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: OrderStatus.PAID },
        take: 20,
      }),
    );
    expect(ordersService.fulfillOrder).toHaveBeenNthCalledWith(1, 'order_1');
    expect(ordersService.fulfillOrder).toHaveBeenNthCalledWith(2, 'order_2');
  });

  it('continues batch when one order is already being processed', async () => {
    const { service, prisma, ordersService } = makeService();
    prisma.order.findMany.mockResolvedValue([{ id: 'order_1' }, { id: 'order_2' }]);
    ordersService.fulfillOrder
      .mockRejectedValueOnce(new ConflictException('Заказ уже обрабатывается'))
      .mockResolvedValueOnce(undefined);

    await service.pickPaidOrders();

    expect(ordersService.fulfillOrder).toHaveBeenCalledTimes(2);
  });
});
