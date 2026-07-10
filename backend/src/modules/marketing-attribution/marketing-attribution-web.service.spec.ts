import { InternalServerErrorException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { MarketingAttributionWebService } from './marketing-attribution-web.service';

const visitorToken = 'a'.repeat(64);
const visitorHash = createHmac('sha256', 'marketing-test-secret')
  .update(visitorToken)
  .digest('hex');

function makeService() {
  const prisma = {
    marketingCampaign: {
      findUnique: jest.fn().mockResolvedValue({ targetPath: '/catalog' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockImplementation(async (callback: any) => callback(prisma)),
  };
  const capture = {
    captureTrustedTouch: jest.fn().mockResolvedValue({
      id: 'touch_1',
      campaignId: 'campaign_1',
    }),
  };
  const lifecycle = {
    recordCurrentTouch: jest.fn().mockResolvedValue(undefined),
    finalizeRegistrationAttributionForNewUser: jest.fn().mockResolvedValue(true),
  };
  const config = {
    get: jest.fn().mockReturnValue('marketing-test-secret'),
  };

  return {
    service: new MarketingAttributionWebService(
      prisma as any,
      capture as any,
      lifecycle as any,
      config as any,
    ),
    prisma,
    capture,
    lifecycle,
    config,
  };
}

describe('MarketingAttributionWebService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('хеширует opaque visitor token на backend и не принимает UTM из browser input', async () => {
    const { service, capture, prisma } = makeService();

    await expect(service.captureWebTouch({
      campaignCode: 'Campaign123',
      visitorToken,
      launchKey: 'b'.repeat(64),
    })).resolves.toEqual({ accepted: true, targetPath: '/catalog' });

    expect(capture.captureTrustedTouch).toHaveBeenCalledWith({
      campaignCode: 'Campaign123',
      channel: 'WEB',
      sourceEventKey: `web:${'b'.repeat(64)}`,
      visitorKeyHash: visitorHash,
    });
    expect(prisma.marketingCampaign.findUnique).toHaveBeenCalledWith({
      where: { id: 'campaign_1' },
      select: { targetPath: true },
    });
  });

  it('атомарно claim-ит pending WEB touches, очищает HMAC и обновляет current attribution', async () => {
    const { service, prisma, lifecycle } = makeService();
    prisma.$queryRaw.mockResolvedValue([
      { id: 'touch_1', userId: 'user_1', occurredAt: new Date('2026-07-10T10:00:00.000Z') },
      { id: 'touch_2', userId: 'user_1', occurredAt: new Date('2026-07-10T10:01:00.000Z') },
    ]);

    await expect(service.claimWebTouches('user_1', { visitorToken })).resolves.toEqual({
      claimedTouches: 2,
      registrationFinalized: true,
    });

    const claimSql = prisma.$queryRaw.mock.calls[0][0].join('');
    expect(claimSql).toContain('UPDATE "marketing_touches"');
    expect(claimSql).toContain('"visitorKeyHash" = NULL');
    expect(claimSql).toContain('"userId" IS NULL');
    expect(claimSql).toContain('RETURNING "id", "userId", "occurredAt"');
    expect(lifecycle.recordCurrentTouch).toHaveBeenNthCalledWith(1, prisma, {
      userId: 'user_1',
      touch: expect.objectContaining({ id: 'touch_1', userId: 'user_1' }),
    });
    expect(lifecycle.recordCurrentTouch).toHaveBeenNthCalledWith(2, prisma, {
      userId: 'user_1',
      touch: expect.objectContaining({ id: 'touch_2', userId: 'user_1' }),
    });
    expect(lifecycle.finalizeRegistrationAttributionForNewUser).toHaveBeenCalledWith(
      prisma,
      'user_1',
    );
  });

  it('может финализировать direct registration без visitor token и не делает raw touch update', async () => {
    const { service, prisma, lifecycle } = makeService();

    await expect(service.claimWebTouches('user_1', {})).resolves.toEqual({
      claimedTouches: 0,
      registrationFinalized: true,
    });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(lifecycle.recordCurrentTouch).not.toHaveBeenCalled();
    expect(lifecycle.finalizeRegistrationAttributionForNewUser).toHaveBeenCalledWith(
      prisma,
      'user_1',
    );
  });

  it('не пишет touch без server-side HMAC secret', async () => {
    const { service, config, capture } = makeService();
    config.get.mockReturnValue('');

    await expect(service.captureWebTouch({
      campaignCode: 'Campaign123',
      visitorToken,
      launchKey: 'b'.repeat(64),
    })).rejects.toThrow(InternalServerErrorException);

    expect(capture.captureTrustedTouch).not.toHaveBeenCalled();
  });
});
