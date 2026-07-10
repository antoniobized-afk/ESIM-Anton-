import { BadRequestException, ConflictException } from '@nestjs/common';
import { MarketingTouch, MarketingTouchChannel } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { TrustedMarketingTouchInput } from './marketing-attribution.types';

const campaignCode = 'AbCdEfGh1234';
const visitorKeyHash = 'a'.repeat(64);
const occurredAt = new Date('2026-07-10T05:00:00.000Z');
const capturedTouch: MarketingTouch = {
  id: 'touch_1',
  campaignId: 'campaign_1',
  userId: 'user_1',
  channel: MarketingTouchChannel.WEB,
  sourceEventKey: 'web:event_1',
  visitorKeyHash: null,
  occurredAt,
  createdAt: occurredAt,
};

function withCampaign(
  touch: MarketingTouch = capturedTouch,
  shortCode = campaignCode,
) {
  return { ...touch, campaign: { shortCode } };
}

function makeService(activeCampaign = true) {
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'campaign_1', isActive: activeCampaign }]),
    marketingCampaign: {
      findUnique: jest.fn().mockResolvedValue({ id: 'campaign_1' }),
      findFirst: jest.fn().mockResolvedValue(activeCampaign ? { id: 'campaign_1' } : null),
    },
    marketingTouch: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(withCampaign()),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const lifecycle = {
    recordCurrentTouch: jest.fn().mockResolvedValue({
      stateId: 'state_1',
      firstTouchUpdated: true,
      lastTouchUpdated: true,
    }),
  };

  return {
    prisma,
    lifecycle,
    service: new MarketingAttributionCaptureService(
      prisma as unknown as PrismaService,
      lifecycle as unknown as MarketingAttributionLifecycleService,
    ),
  };
}

describe('MarketingAttributionCaptureService', () => {
  const userInput = {
    campaignCode,
    channel: MarketingTouchChannel.WEB,
    sourceEventKey: 'web:event_1',
    occurredAt,
    userId: 'user_1',
  };

  it('берёт shared row lock и bounded transaction budget до touch write', async () => {
    const { service, prisma, lifecycle } = makeService();

    await expect(service.captureTrustedTouch(userInput)).resolves.toEqual(capturedTouch);

    const lockSql = prisma.$queryRaw.mock.calls[0][0].join('');
    expect(lockSql).toContain('FROM "marketing_campaigns"');
    expect(lockSql).toContain('"isActive"');
    expect(lockSql).toContain('"shortCode"');
    expect(lockSql).toContain('FOR SHARE');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 60_000,
    });
    expect(prisma.marketingTouch.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$queryRaw.mock.invocationCallOrder[0],
    );
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.marketingTouch.findUnique.mock.invocationCallOrder[1],
    );
    expect(prisma.marketingTouch.findUnique.mock.invocationCallOrder[1]).toBeLessThan(
      prisma.marketingTouch.createMany.mock.invocationCallOrder[0],
    );
    expect(prisma.marketingCampaign.findFirst).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.findUnique).not.toHaveBeenCalled();
    expect(prisma.marketingTouch.findUnique).toHaveBeenCalledTimes(3);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.marketingTouch.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sourceEventKey: 'web:event_1',
          userId: 'user_1',
          visitorKeyHash: null,
        }),
      ],
      skipDuplicates: true,
    });
    expect(lifecycle.recordCurrentTouch).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user_1',
      touch: expect.objectContaining({ id: 'touch_1', occurredAt, userId: 'user_1' }),
    });
  });

  it('канонизирует anonymous touch как visitor-only association', async () => {
    const { service, prisma, lifecycle } = makeService();
    const anonymousTouch: MarketingTouch = {
      ...capturedTouch,
      userId: null,
      visitorKeyHash,
    };
    prisma.marketingTouch.findUnique
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(withCampaign(anonymousTouch));

    await expect(
      service.captureTrustedTouch({
        campaignCode,
        channel: MarketingTouchChannel.WEB,
        sourceEventKey: 'web:event_1',
        occurredAt,
        visitorKeyHash: 'A'.repeat(64),
      }),
    ).resolves.toEqual(anonymousTouch);

    expect(prisma.marketingTouch.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: null,
          visitorKeyHash,
        }),
      ],
      skipDuplicates: true,
    });
    expect(lifecycle.recordCurrentTouch).not.toHaveBeenCalled();
  });

  it.each([
    ['без association', {}],
    ['с userId и visitor HMAC одновременно', { userId: 'user_1', visitorKeyHash }],
    ['с blank userId и visitor HMAC', { userId: '   ', visitorKeyHash }],
  ])('отклоняет touch %s до transaction', async (_case, association) => {
    const { service, prisma } = makeService();
    const invalidInput = {
      campaignCode,
      channel: MarketingTouchChannel.WEB,
      sourceEventKey: 'web:event_1',
      occurredAt,
      ...association,
    } as unknown as TrustedMarketingTouchInput;

    await expect(service.captureTrustedTouch(invalidInput)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('возвращает matching retry даже после campaign deactivation', async () => {
    const { service, prisma, lifecycle } = makeService(false);
    prisma.marketingTouch.findUnique.mockReset().mockResolvedValue(withCampaign());

    await expect(service.captureTrustedTouch(userInput)).resolves.toEqual(capturedTouch);

    expect(prisma.marketingCampaign.findUnique).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.marketingTouch.createMany).not.toHaveBeenCalled();
    expect(lifecycle.recordCurrentTouch).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: 'user_1',
        touch: expect.objectContaining({ id: 'touch_1', userId: 'user_1' }),
      },
    );
  });

  it('возвращает retry, созданный пока transaction ждала campaign lock', async () => {
    const { service, prisma } = makeService(false);
    prisma.marketingTouch.findUnique
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(withCampaign());

    await expect(service.captureTrustedTouch(userInput)).resolves.toEqual(capturedTouch);

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.marketingTouch.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.marketingCampaign.findFirst).not.toHaveBeenCalled();
    expect(prisma.marketingTouch.createMany).not.toHaveBeenCalled();
  });

  it('отклоняет reuse key с другой campaign, channel или occurredAt', async () => {
    const conflictingTouches = [
      withCampaign(capturedTouch, 'OtherCode123'),
      withCampaign({ ...capturedTouch, channel: MarketingTouchChannel.TELEGRAM_BOT }),
      withCampaign({ ...capturedTouch, occurredAt: new Date('2026-07-10T05:01:00.000Z') }),
    ];

    for (const conflictingTouch of conflictingTouches) {
      const { service, prisma } = makeService();
      prisma.marketingTouch.findUnique.mockReset().mockResolvedValue(conflictingTouch);

      await expect(service.captureTrustedTouch(userInput)).rejects.toThrow(ConflictException);
      expect(prisma.marketingTouch.createMany).not.toHaveBeenCalled();
    }
  });

  it('отклоняет cross-user и pending visitor mismatch', async () => {
    const userConflict = makeService();
    userConflict.prisma.marketingTouch.findUnique
      .mockReset()
      .mockResolvedValue(withCampaign({ ...capturedTouch, userId: 'user_2' }));

    await expect(userConflict.service.captureTrustedTouch(userInput)).rejects.toThrow(
      ConflictException,
    );

    const visitorConflict = makeService();
    visitorConflict.prisma.marketingTouch.findUnique.mockReset().mockResolvedValue(
      withCampaign({
        ...capturedTouch,
        userId: null,
        visitorKeyHash: 'b'.repeat(64),
      }),
    );

    await expect(
      visitorConflict.service.captureTrustedTouch({
        campaignCode,
        channel: MarketingTouchChannel.WEB,
        sourceEventKey: 'web:event_1',
        occurredAt,
        visitorKeyHash,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('отклоняет anonymous retry после trusted claim без раскрытия user association', async () => {
    const { service, prisma, lifecycle } = makeService();
    prisma.marketingTouch.findUnique.mockReset().mockResolvedValue(withCampaign());

    await expect(
      service.captureTrustedTouch({
        campaignCode,
        channel: MarketingTouchChannel.WEB,
        sourceEventKey: 'web:event_1',
        occurredAt,
        visitorKeyHash,
      }),
    ).rejects.toThrow(ConflictException);

    expect(lifecycle.recordCurrentTouch).not.toHaveBeenCalled();
    expect(prisma.marketingTouch.createMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('делает safe readback, если concurrent insert уже занял key', async () => {
    const { service, prisma } = makeService();
    prisma.marketingTouch.createMany.mockResolvedValue({ count: 0 });

    await expect(service.captureTrustedTouch(userInput)).resolves.toEqual(capturedTouch);

    expect(prisma.marketingTouch.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(prisma.marketingTouch.findUnique).toHaveBeenCalledTimes(3);
  });

  it('не пишет touch, если campaign стала inactive до row lock', async () => {
    const { service, prisma, lifecycle } = makeService(false);

    await expect(service.captureTrustedTouch(userInput)).resolves.toBeNull();

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.marketingTouch.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.marketingTouch.createMany).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.findFirst).not.toHaveBeenCalled();
    expect(prisma.marketingCampaign.findUnique).not.toHaveBeenCalled();
    expect(lifecycle.recordCurrentTouch).not.toHaveBeenCalled();
  });
});
