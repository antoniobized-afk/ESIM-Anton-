import { NotFoundException } from '@nestjs/common';
import { MarketingRegistrationAttributionStatus, MarketingTouchChannel } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MarketingUserTimelineService } from './marketing-user-timeline.service';

const campaign = {
  id: 'campaign_1',
  shortCode: 'AbCdEfGh1234',
  name: 'Summer launch',
  utmSource: 'blogger',
  utmMedium: 'social',
  utmCampaign: 'summer-2026',
  utmContent: null,
  utmTerm: null,
};

const touch = {
  id: 'touch_1',
  channel: MarketingTouchChannel.TELEGRAM_BOT,
  occurredAt: new Date('2026-07-10T08:00:00.000Z'),
  campaign,
};

function makeService() {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user_1',
        marketingAttribution: {
          firstTouch: touch,
          lastTouch: touch,
          registrationStatus: MarketingRegistrationAttributionStatus.ATTRIBUTED,
          registrationEligibleAt: new Date('2026-07-10T08:00:00.000Z'),
          registrationFinalizedAt: new Date('2026-07-10T08:01:00.000Z'),
          registrationFirstCampaignId: campaign.id,
          registrationFirstCampaignCode: campaign.shortCode,
          registrationFirstCampaignName: campaign.name,
          registrationFirstUtmSource: campaign.utmSource,
          registrationFirstUtmMedium: campaign.utmMedium,
          registrationFirstUtmCampaign: campaign.utmCampaign,
          registrationFirstUtmContent: null,
          registrationFirstUtmTerm: null,
          registrationFirstChannel: MarketingTouchChannel.TELEGRAM_BOT,
          registrationFirstOccurredAt: touch.occurredAt,
          registrationLastCampaignId: campaign.id,
          registrationLastCampaignCode: campaign.shortCode,
          registrationLastCampaignName: campaign.name,
          registrationLastUtmSource: campaign.utmSource,
          registrationLastUtmMedium: campaign.utmMedium,
          registrationLastUtmCampaign: campaign.utmCampaign,
          registrationLastUtmContent: null,
          registrationLastUtmTerm: null,
          registrationLastChannel: MarketingTouchChannel.TELEGRAM_BOT,
          registrationLastOccurredAt: touch.occurredAt,
        },
        marketingTouches: [touch],
        _count: { marketingTouches: 1 },
      }),
    },
  };

  return {
    prisma,
    service: new MarketingUserTimelineService(prisma as unknown as PrismaService),
  };
}

describe('MarketingUserTimelineService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('читает timeline одним bounded user query по canonical userId', async () => {
    const { prisma, service } = makeService();

    const result = await service.getUserTimeline('user_1', { page: 2, limit: 10 });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    const query = prisma.user.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: 'user_1' });
    expect(query.select).not.toHaveProperty('telegramId');
    expect(query.select.marketingTouches).toEqual(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(query.select.marketingTouches.select).not.toHaveProperty('sourceEventKey');
    expect(query.select.marketingTouches.select).not.toHaveProperty('visitorKeyHash');
    expect(query.select.marketingTouches.select).not.toHaveProperty('userId');
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user_1',
        current: { first: touch, last: touch },
        touches: {
          data: [touch],
          meta: { total: 1, page: 2, limit: 10, totalPages: 1 },
        },
      }),
    );
  });

  it('возвращает immutable registration snapshots из state, а не current campaign lookup', async () => {
    const { service } = makeService();

    const result = await service.getUserTimeline('user_1');

    expect(result.registration).toEqual(
      expect.objectContaining({
        status: MarketingRegistrationAttributionStatus.ATTRIBUTED,
        first: expect.objectContaining({
          occurredAt: touch.occurredAt,
          channel: MarketingTouchChannel.TELEGRAM_BOT,
          campaign,
        }),
        last: expect.objectContaining({ campaign }),
      }),
    );
  });

  it('возвращает пустую factual timeline для существующего пользователя без marketing state', async () => {
    const { prisma, service } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'legacy_user',
      marketingAttribution: null,
      marketingTouches: [],
      _count: { marketingTouches: 0 },
    });

    await expect(service.getUserTimeline('legacy_user')).resolves.toEqual({
      userId: 'legacy_user',
      current: { first: null, last: null },
      registration: null,
      touches: {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
      },
    });
  });

  it('не синтезирует timeline для отсутствующего userId', async () => {
    const { prisma, service } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getUserTimeline('missing_user')).rejects.toThrow(NotFoundException);
  });
});
