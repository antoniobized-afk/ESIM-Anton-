import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MarketingTouchChannel } from '@prisma/client';
import { MarketingUserTimelineQueryDto } from './dto/marketing-user-timeline-query.dto';

type RegistrationSnapshotInput = {
  campaignId: string | null;
  campaignCode: string | null;
  campaignName: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  channel: MarketingTouchChannel | null;
  occurredAt: Date | null;
};

@Injectable()
export class MarketingUserTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserTimeline(userId: string, query: MarketingUserTimelineQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const touchSelect = this.touchSelect();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        marketingAttribution: {
          select: {
            firstTouch: { select: touchSelect },
            lastTouch: { select: touchSelect },
            registrationStatus: true,
            registrationEligibleAt: true,
            registrationFinalizedAt: true,
            registrationFirstCampaignId: true,
            registrationFirstCampaignCode: true,
            registrationFirstCampaignName: true,
            registrationFirstUtmSource: true,
            registrationFirstUtmMedium: true,
            registrationFirstUtmCampaign: true,
            registrationFirstUtmContent: true,
            registrationFirstUtmTerm: true,
            registrationFirstChannel: true,
            registrationFirstOccurredAt: true,
            registrationLastCampaignId: true,
            registrationLastCampaignCode: true,
            registrationLastCampaignName: true,
            registrationLastUtmSource: true,
            registrationLastUtmMedium: true,
            registrationLastUtmCampaign: true,
            registrationLastUtmContent: true,
            registrationLastUtmTerm: true,
            registrationLastChannel: true,
            registrationLastOccurredAt: true,
          },
        },
        marketingTouches: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          select: touchSelect,
        },
        _count: { select: { marketingTouches: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const attribution = user.marketingAttribution;
    const total = user._count.marketingTouches;

    return {
      userId: user.id,
      current: {
        first: attribution?.firstTouch ?? null,
        last: attribution?.lastTouch ?? null,
      },
      registration: attribution
        ? {
            status: attribution.registrationStatus,
            eligibleAt: attribution.registrationEligibleAt,
            finalizedAt: attribution.registrationFinalizedAt,
            first: this.registrationSnapshot({
              campaignId: attribution.registrationFirstCampaignId,
              campaignCode: attribution.registrationFirstCampaignCode,
              campaignName: attribution.registrationFirstCampaignName,
              utmSource: attribution.registrationFirstUtmSource,
              utmMedium: attribution.registrationFirstUtmMedium,
              utmCampaign: attribution.registrationFirstUtmCampaign,
              utmContent: attribution.registrationFirstUtmContent,
              utmTerm: attribution.registrationFirstUtmTerm,
              channel: attribution.registrationFirstChannel,
              occurredAt: attribution.registrationFirstOccurredAt,
            }),
            last: this.registrationSnapshot({
              campaignId: attribution.registrationLastCampaignId,
              campaignCode: attribution.registrationLastCampaignCode,
              campaignName: attribution.registrationLastCampaignName,
              utmSource: attribution.registrationLastUtmSource,
              utmMedium: attribution.registrationLastUtmMedium,
              utmCampaign: attribution.registrationLastUtmCampaign,
              utmContent: attribution.registrationLastUtmContent,
              utmTerm: attribution.registrationLastUtmTerm,
              channel: attribution.registrationLastChannel,
              occurredAt: attribution.registrationLastOccurredAt,
            }),
          }
        : null,
      touches: {
        data: user.marketingTouches,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    };
  }

  private touchSelect() {
    return {
      id: true,
      channel: true,
      occurredAt: true,
      campaign: {
        select: {
          id: true,
          shortCode: true,
          name: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          utmContent: true,
          utmTerm: true,
        },
      },
    } as const;
  }

  private registrationSnapshot(input: RegistrationSnapshotInput) {
    if (!input.campaignId || !input.occurredAt || !input.channel) {
      return null;
    }

    return {
      occurredAt: input.occurredAt,
      channel: input.channel,
      campaign: {
        id: input.campaignId,
        shortCode: input.campaignCode,
        name: input.campaignName,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmContent: input.utmContent,
        utmTerm: input.utmTerm,
      },
    };
  }
}
