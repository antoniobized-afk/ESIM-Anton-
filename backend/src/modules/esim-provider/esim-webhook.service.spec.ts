import { EsimWebhookService } from './esim-webhook.service';

function makeService() {
  const prisma = {
    order: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };

  const telegramNotification = {
    notifyAdmin: jest.fn().mockResolvedValue(undefined),
    sendTextNotification: jest.fn().mockResolvedValue(undefined),
  };

  const esimProviderService = {
    queryOrder: jest.fn(),
  };

  const ordersService = {
    finalizeProviderIssuedProcessingOrder: jest.fn().mockResolvedValue({
      finalized: true,
      orderStatus: 'COMPLETED',
      category: 'issued_but_finalize_failed',
      reason: 'provider_issued_snapshot_finalized',
    }),
  };

  const service = new EsimWebhookService(
    prisma as any,
    telegramNotification as any,
    esimProviderService as any,
    ordersService as any,
  );

  return { service, prisma, telegramNotification, esimProviderService, ordersService };
}

describe('EsimWebhookService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ORDER_STATUS GOT_RESOURCE дообогащает локальный заказ через provider query', async () => {
    const { service, prisma, esimProviderService, ordersService } = makeService();

    prisma.order.findFirst.mockResolvedValue({
      id: 'order_1',
      status: 'PROCESSING',
      iccid: null,
      qrCode: null,
      activationCode: null,
      smdpAddress: null,
      providerOrderId: null,
    });
    esimProviderService.queryOrder.mockResolvedValue({
      esimList: [
        {
          iccid: '8988',
          qrCodeUrl: 'https://qr.example',
          lpaCode: 'LPA:1$example',
          smdpAddress: 'rsp.example',
        },
      ],
    });

    await service.handleWebhook({
      notifyType: 'ORDER_STATUS',
      content: {
        orderNo: 'B123',
        orderStatus: 'GOT_RESOURCE',
      },
    });

    expect(esimProviderService.queryOrder).toHaveBeenCalledWith('B123');
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: {
        providerOrderId: 'B123',
        iccid: '8988',
        qrCode: 'https://qr.example',
        activationCode: 'LPA:1$example',
        smdpAddress: 'rsp.example',
        providerResponse: {
          esimList: [
            {
              iccid: '8988',
              qrCodeUrl: 'https://qr.example',
              lpaCode: 'LPA:1$example',
              smdpAddress: 'rsp.example',
            },
          ],
        },
      },
    });
    expect(ordersService.finalizeProviderIssuedProcessingOrder).toHaveBeenCalledWith('order_1');
  });

  it('ORDER_STATUS ищет локальный заказ по transactionId, если providerOrderId ещё не сохранён', async () => {
    const { service, prisma, esimProviderService, ordersService } = makeService();

    prisma.order.findFirst.mockResolvedValue({
      id: 'order_1',
      status: 'PROCESSING',
      iccid: null,
      qrCode: null,
      activationCode: null,
      smdpAddress: null,
      providerOrderId: null,
    });
    esimProviderService.queryOrder.mockResolvedValue({
      esimList: [{ iccid: '8988', qrCodeUrl: 'https://qr.example' }],
    });

    await service.handleWebhook({
      notifyType: 'ORDER_STATUS',
      content: {
        orderNo: 'B123',
        transactionId: 'order_1',
        orderStatus: 'GOT_RESOURCE',
      },
    });

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { providerOrderId: 'B123' },
            { id: 'order_1' },
          ],
        },
      }),
    );
    expect(ordersService.finalizeProviderIssuedProcessingOrder).toHaveBeenCalledWith('order_1');
  });

  it('ORDER_STATUS дофинализирует уже обогащённый processing-заказ без provider query', async () => {
    const { service, prisma, esimProviderService, ordersService } = makeService();

    prisma.order.findFirst.mockResolvedValue({
      id: 'order_1',
      status: 'PROCESSING',
      iccid: '8988',
      qrCode: 'https://qr.example',
      activationCode: 'LPA:1$example',
      smdpAddress: 'rsp.example',
      providerOrderId: 'B123',
    });

    await service.handleWebhook({
      notifyType: 'ORDER_STATUS',
      content: {
        orderNo: 'B123',
        orderStatus: 'GOT_RESOURCE',
      },
    });

    expect(esimProviderService.queryOrder).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(ordersService.finalizeProviderIssuedProcessingOrder).toHaveBeenCalledWith('order_1');
  });

  it('ORDER_STATUS не автофинализирует профиль без установочных данных', async () => {
    const { service, prisma, esimProviderService, ordersService } = makeService();

    prisma.order.findFirst.mockResolvedValue({
      id: 'order_1',
      status: 'PROCESSING',
      iccid: null,
      qrCode: null,
      activationCode: null,
      smdpAddress: null,
      providerOrderId: null,
    });
    esimProviderService.queryOrder.mockResolvedValue({
      esimList: [{ iccid: '8988' }],
    });

    await service.handleWebhook({
      notifyType: 'ORDER_STATUS',
      content: {
        orderNo: 'B123',
        orderStatus: 'GOT_RESOURCE',
      },
    });

    expect(prisma.order.update).toHaveBeenCalled();
    expect(ordersService.finalizeProviderIssuedProcessingOrder).not.toHaveBeenCalled();
  });

  it('ORDER_STATUS без orderNo не падает', async () => {
    const { service, prisma, esimProviderService } = makeService();

    await service.handleWebhook({
      notifyType: 'ORDER_STATUS',
      content: {
        orderStatus: 'GOT_RESOURCE',
      },
    });

    expect(prisma.order.findFirst).not.toHaveBeenCalled();
    expect(esimProviderService.queryOrder).not.toHaveBeenCalled();
  });

  it('ORDER_STATUS пробрасывает ошибку provider query, чтобы callback можно было ретраить', async () => {
    const { service, prisma, esimProviderService } = makeService();

    prisma.order.findFirst.mockResolvedValue({
      id: 'order_1',
      iccid: null,
      qrCode: null,
      activationCode: null,
      smdpAddress: null,
    });
    esimProviderService.queryOrder.mockRejectedValue(new Error('provider timeout'));

    await expect(
      service.handleWebhook({
        notifyType: 'ORDER_STATUS',
        notifyId: 'notify_1',
        eventGenerateTime: new Date().toISOString(),
        content: {
          orderNo: 'B123',
          orderStatus: 'GOT_RESOURCE',
        },
      }),
    ).rejects.toThrow('provider timeout');
  });
});
