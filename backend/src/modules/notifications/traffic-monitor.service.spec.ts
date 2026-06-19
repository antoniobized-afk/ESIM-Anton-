import { TrafficMonitorService } from './traffic-monitor.service';
import { OrderStatus } from '@prisma/client';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    iccid: '8965012601090428233',
    status: OrderStatus.PAID,
    parentOrderId: null,
    lowTrafficNotifiedAt: null,
    expiryNotifiedAt: null,
    lastUsageAt: null,
    expiresAt: null,
    product: { country: 'Таиланд' },
    user: { id: 'user_1', telegramId: BigInt(123456) },
    ...overrides,
  };
}

function makeService(enabledOverride?: string) {
  const prisma = {
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const ordersService = {
    getOrderUsage: jest.fn(),
  };

  const telegramNotification = {
    sendTextNotification: jest.fn().mockResolvedValue(undefined),
  };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'TRAFFIC_MONITOR_ENABLED') return enabledOverride ?? 'true';
      if (key === 'TRAFFIC_LOW_PERCENT') return '10';
      if (key === 'TRAFFIC_BATCH_SIZE') return '50';
      if (key === 'TRAFFIC_THROTTLE_MS') return '0'; // no delay in tests
      return undefined;
    }),
  };

  const service = new (TrafficMonitorService as any)(
    prisma,
    ordersService,
    telegramNotification,
    config,
  ) as TrafficMonitorService;

  return { service, prisma, ordersService, telegramNotification };
}

/* ------------------------------------------------------------------ */
/*  monitorTrafficLevels                                              */
/* ------------------------------------------------------------------ */

describe('TrafficMonitorService.monitorTrafficLevels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('не выполняется, если TRAFFIC_MONITOR_ENABLED=false', async () => {
    const { service, prisma } = makeService('false');

    await service.monitorTrafficLevels();

    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('пропускает заказы, по которым usage недоступен', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    prisma.order.findMany.mockResolvedValue([makeOrder()]);
    ordersService.getOrderUsage.mockResolvedValue({
      available: false,
      totalBytes: null,
      remainingBytes: null,
    });

    await service.monitorTrafficLevels();

    expect(telegramNotification.sendTextNotification).not.toHaveBeenCalled();
  });

  it('отправляет уведомление при остатке ниже порога %', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    const order = makeOrder();
    prisma.order.findMany.mockResolvedValue([order]);

    const totalBytes = 1_000_000_000; // 1 GB
    const remainingBytes = 50_000_000; // 50 MB → 5% → ниже порога 10%
    ordersService.getOrderUsage.mockResolvedValue({
      available: true,
      totalBytes,
      usedBytes: totalBytes - remainingBytes,
      remainingBytes,
    });

    await service.monitorTrafficLevels();

    expect(telegramNotification.sendTextNotification).toHaveBeenCalledTimes(1);
    const [tgId, text, opts] =
      telegramNotification.sendTextNotification.mock.calls[0];
    expect(tgId).toBe('123456');
    expect(text).toContain('Низкий остаток трафика');
    expect(text).toContain('Таиланд');
    expect(opts).toEqual({ openMyEsim: true });

    // Помечает заказ как уведомлённый
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['order_1'] } },
      data: { lowTrafficNotifiedAt: expect.any(Date) },
    });
  });

  it('НЕ даёт ложного срабатывания на 100 МБ пакете (полный остаток)', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    prisma.order.findMany.mockResolvedValue([makeOrder()]);

    // 100 МБ пакет, 100 МБ осталось — 100%, НЕ должен срабатывать
    const totalBytes = 100 * 1024 * 1024;
    const remainingBytes = 100 * 1024 * 1024;
    ordersService.getOrderUsage.mockResolvedValue({
      available: true,
      totalBytes,
      usedBytes: 0,
      remainingBytes,
    });

    await service.monitorTrafficLevels();

    expect(telegramNotification.sendTextNotification).not.toHaveBeenCalled();
  });

  it('НЕ уведомляет, если остаток выше порога', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    prisma.order.findMany.mockResolvedValue([makeOrder()]);

    const totalBytes = 2_000_000_000; // 2 GB
    const remainingBytes = 500_000_000; // 500 MB → 25%
    ordersService.getOrderUsage.mockResolvedValue({
      available: true,
      totalBytes,
      usedBytes: totalBytes - remainingBytes,
      remainingBytes,
    });

    await service.monitorTrafficLevels();

    expect(telegramNotification.sendTextNotification).not.toHaveBeenCalled();
  });

  it('не шлёт повторно, если уже уведомляли (флаг недавно проставлен)', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    const order = makeOrder({
      lowTrafficNotifiedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2ч назад
    });
    prisma.order.findMany.mockResolvedValue([order]);
    ordersService.getOrderUsage.mockResolvedValue({
      available: true,
      totalBytes: 1_000_000_000,
      usedBytes: 990_000_000,
      remainingBytes: 10_000_000, // 10 MB → 1%
    });

    await service.monitorTrafficLevels();

    expect(telegramNotification.sendTextNotification).not.toHaveBeenCalled();
  });

  it('не шлёт повторно даже спустя сутки — уведомляем один раз, без cooldown re-send', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    const order = makeOrder({
      lowTrafficNotifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25ч назад
    });
    prisma.order.findMany.mockResolvedValue([order]);
    ordersService.getOrderUsage.mockResolvedValue({
      available: true,
      totalBytes: 1_000_000_000,
      usedBytes: 990_000_000,
      remainingBytes: 10_000_000,
    });

    await service.monitorTrafficLevels();

    // Раньше тут был повторный re-send после 24ч cooldown. Теперь — молчим,
    // повтор только после пополнения (флаг сбрасывается в OrdersService).
    expect(telegramNotification.sendTextNotification).not.toHaveBeenCalled();
  });

  it('пропускает заказы без telegramId у юзера', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    const order = makeOrder({ user: { id: 'u1', telegramId: null } });
    prisma.order.findMany.mockResolvedValue([order]);
    ordersService.getOrderUsage.mockResolvedValue({
      available: true,
      totalBytes: 1_000_000_000,
      usedBytes: 999_000_000,
      remainingBytes: 1_000_000,
    });

    await service.monitorTrafficLevels();

    expect(telegramNotification.sendTextNotification).not.toHaveBeenCalled();
  });

  it('группирует несколько eSIM одного юзера в одно сообщение', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    const order1 = makeOrder({ id: 'o1', product: { country: 'Таиланд' } });
    const order2 = makeOrder({ id: 'o2', product: { country: 'Япония' } });
    prisma.order.findMany.mockResolvedValue([order1, order2]);
    ordersService.getOrderUsage.mockResolvedValue({
      available: true,
      totalBytes: 1_000_000_000,
      usedBytes: 999_000_000,
      remainingBytes: 1_000_000, // ~1 MB
    });

    await service.monitorTrafficLevels();

    // Одно сообщение, не два
    expect(telegramNotification.sendTextNotification).toHaveBeenCalledTimes(1);
    const text = telegramNotification.sendTextNotification.mock.calls[0][1];
    expect(text).toContain('Таиланд');
    expect(text).toContain('Япония');
    expect(text).toContain('2 ваших eSIM');

    // updateMany с обоими order id
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['o1', 'o2'] } },
      data: { lowTrafficNotifiedAt: expect.any(Date) },
    });
  });

  it('не падает при ошибке getOrderUsage — продолжает остальные', async () => {
    const { service, prisma, ordersService, telegramNotification } =
      makeService();
    const order1 = makeOrder({ id: 'o_err' });
    const order2 = makeOrder({ id: 'o_ok', product: { country: 'Корея' } });
    prisma.order.findMany.mockResolvedValue([order1, order2]);
    ordersService.getOrderUsage
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce({
        available: true,
        totalBytes: 1_000_000_000,
        usedBytes: 999_000_000,
        remainingBytes: 1_000_000,
      });

    await service.monitorTrafficLevels();

    // Уведомление отправлено только по o_ok
    expect(telegramNotification.sendTextNotification).toHaveBeenCalledTimes(1);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['o_ok'] } },
      data: { lowTrafficNotifiedAt: expect.any(Date) },
    });
  });
});

/* ------------------------------------------------------------------ */
/*  monitorExpiringEsims                                              */
/* ------------------------------------------------------------------ */

describe('TrafficMonitorService.monitorExpiringEsims', () => {
  beforeEach(() => jest.clearAllMocks());

  it('не выполняется, если TRAFFIC_MONITOR_ENABLED=false', async () => {
    const { service, prisma } = makeService('false');

    await service.monitorExpiringEsims();

    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('отправляет уведомление за 24ч до истечения', async () => {
    const { service, prisma, telegramNotification } = makeService();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // через 12ч
    const order = makeOrder({ expiresAt, expiryNotifiedAt: null });
    prisma.order.findMany.mockResolvedValue([order]);

    await service.monitorExpiringEsims();

    expect(telegramNotification.sendTextNotification).toHaveBeenCalledTimes(1);
    const text = telegramNotification.sendTextNotification.mock.calls[0][1];
    expect(text).toContain('eSIM скоро истекает');
    expect(text).toContain('Таиланд');

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['order_1'] } },
      data: { expiryNotifiedAt: expect.any(Date) },
    });
  });

  it('не шлёт повторно (expiryNotifiedAt уже задан)', async () => {
    const { service, prisma, telegramNotification } = makeService();
    // Пустой результат — Prisma where фильтрует expiryNotifiedAt: null
    prisma.order.findMany.mockResolvedValue([]);

    await service.monitorExpiringEsims();

    expect(telegramNotification.sendTextNotification).not.toHaveBeenCalled();
  });
});
