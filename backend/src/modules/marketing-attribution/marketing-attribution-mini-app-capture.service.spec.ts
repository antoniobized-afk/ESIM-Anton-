import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MarketingTelegramCaptureStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MarketingAttributionTelegramService } from './marketing-attribution-telegram.service';
import { MarketingAttributionMiniAppCaptureService } from './marketing-attribution-mini-app-capture.service';

const launch = {
  userId: 'user_1',
  telegramId: '123456789',
  startParam: 'ma_Campaign123',
  sourceEventKey: 'telegram-mini-app:event_1',
};

function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intent_1',
    userId: 'user_1',
    telegramId: 123456789n,
    startParam: 'ma_Campaign123',
    sourceEventKey: 'telegram-mini-app:event_1',
    status: MarketingTelegramCaptureStatus.PENDING,
    attempts: 1,
    lastAttemptAt: new Date('2026-07-10T10:00:00.000Z'),
    nextRetryAt: null,
    lastError: null,
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    updatedAt: new Date('2026-07-10T10:00:00.000Z'),
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    marketingMiniAppCaptureIntent: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  };
  const telegramAttribution = {
    captureMiniAppTouch: jest.fn().mockResolvedValue({
      accepted: true,
      registrationFinalized: true,
    }),
  };

  return {
    prisma,
    telegramAttribution,
    service: new MarketingAttributionMiniAppCaptureService(
      prisma as unknown as PrismaService,
      telegramAttribution as unknown as MarketingAttributionTelegramService,
    ),
  };
}

describe('MarketingAttributionMiniAppCaptureService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('durable сохраняет verified launch, не выполняя capture в caller path', async () => {
    const { service, prisma, telegramAttribution } = makeService();
    prisma.marketingMiniAppCaptureIntent.findUnique.mockResolvedValue(makeIntent());

    await expect(service.enqueueVerifiedMiniAppLaunch(launch)).resolves.toEqual(makeIntent());

    expect(prisma.marketingMiniAppCaptureIntent.createMany).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        telegramId: 123456789n,
        startParam: 'ma_Campaign123',
        sourceEventKey: 'telegram-mini-app:event_1',
      },
      skipDuplicates: true,
    });
    expect(telegramAttribution.captureMiniAppTouch).not.toHaveBeenCalled();
    expect(prisma.marketingMiniAppCaptureIntent.updateMany).not.toHaveBeenCalled();
  });

  it('ставит transient worker capture failure в FAILED с backoff', async () => {
    const { service, prisma, telegramAttribution } = makeService();
    prisma.marketingMiniAppCaptureIntent.findMany.mockResolvedValue([{ id: 'intent_1' }]);
    prisma.marketingMiniAppCaptureIntent.findUnique.mockResolvedValue(
      makeIntent({ attempts: 1 }),
    );
    telegramAttribution.captureMiniAppTouch.mockRejectedValue(new Error('database unavailable'));

    await service.retryPendingMiniAppCaptures();

    expect(prisma.marketingMiniAppCaptureIntent.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'intent_1' },
        data: expect.objectContaining({
          status: MarketingTelegramCaptureStatus.FAILED,
          lastError: 'database unavailable',
          nextRetryAt: expect.any(Date),
        }),
      }),
    );
  });

  it('terminal worker identity conflict помечает REJECTED и не планирует retry', async () => {
    const { service, prisma, telegramAttribution } = makeService();
    prisma.marketingMiniAppCaptureIntent.findMany.mockResolvedValue([{ id: 'intent_1' }]);
    prisma.marketingMiniAppCaptureIntent.findUnique.mockResolvedValue(makeIntent());
    telegramAttribution.captureMiniAppTouch.mockRejectedValue(
      new ForbiddenException('Telegram identity mismatch'),
    );

    await service.retryPendingMiniAppCaptures();

    expect(prisma.marketingMiniAppCaptureIntent.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: MarketingTelegramCaptureStatus.REJECTED,
          nextRetryAt: null,
        }),
      }),
    );
  });

  it('не перезаписывает trusted launch при повторе source event key', async () => {
    const { service, prisma, telegramAttribution } = makeService();
    prisma.marketingMiniAppCaptureIntent.findUnique.mockResolvedValue(
      makeIntent({ status: MarketingTelegramCaptureStatus.REJECTED }),
    );

    await expect(service.enqueueVerifiedMiniAppLaunch(launch)).resolves.toEqual(
      makeIntent({ status: MarketingTelegramCaptureStatus.REJECTED }),
    );

    expect(prisma.marketingMiniAppCaptureIntent.createMany).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        telegramId: 123456789n,
        startParam: 'ma_Campaign123',
        sourceEventKey: 'telegram-mini-app:event_1',
      },
      skipDuplicates: true,
    });
    expect(telegramAttribution.captureMiniAppTouch).not.toHaveBeenCalled();
  });

  it('отклоняет reuse source event key с другой trusted association', async () => {
    const { service, prisma } = makeService();
    prisma.marketingMiniAppCaptureIntent.findUnique.mockResolvedValue(
      makeIntent({ userId: 'user_2' }),
    );

    await expect(service.enqueueVerifiedMiniAppLaunch(launch)).rejects.toThrow(ConflictException);
    expect(prisma.marketingMiniAppCaptureIntent.createMany).toHaveBeenCalledTimes(1);
  });

  it('cron выбирает due intent и применяет его через тот же idempotent owner', async () => {
    const { service, prisma, telegramAttribution } = makeService();
    prisma.marketingMiniAppCaptureIntent.findMany.mockResolvedValue([{ id: 'intent_1' }]);
    prisma.marketingMiniAppCaptureIntent.findUnique.mockResolvedValue(makeIntent());

    await service.retryPendingMiniAppCaptures();

    expect(prisma.marketingMiniAppCaptureIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              MarketingTelegramCaptureStatus.PENDING,
              MarketingTelegramCaptureStatus.FAILED,
            ],
          },
        }),
        take: 20,
      }),
    );
    expect(telegramAttribution.captureMiniAppTouch).toHaveBeenCalledWith(launch);
    expect(prisma.marketingMiniAppCaptureIntent.deleteMany).toHaveBeenCalledWith({
      where: { id: 'intent_1' },
    });
  });

  it('удаляет stale applied/rejected intents через семь дней', async () => {
    const { service, prisma } = makeService();

    await service.cleanupExpiredMiniAppCaptureIntents();

    expect(prisma.marketingMiniAppCaptureIntent.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: MarketingTelegramCaptureStatus.REJECTED,
          updatedAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });
});
