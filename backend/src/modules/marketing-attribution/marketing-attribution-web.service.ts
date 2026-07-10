import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MarketingTouchChannel } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CaptureMarketingWebTouchDto } from './dto/capture-marketing-web-touch.dto';
import { ClaimMarketingWebTouchesDto } from './dto/claim-marketing-web-touches.dto';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';

type ClaimedWebTouch = {
  id: string;
  userId: string;
  occurredAt: Date;
};

const CLAIM_TRANSACTION_MAX_WAIT_MS = 10_000;
const CLAIM_TRANSACTION_TIMEOUT_MS = 60_000;

@Injectable()
export class MarketingAttributionWebService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capture: MarketingAttributionCaptureService,
    private readonly lifecycle: MarketingAttributionLifecycleService,
    private readonly config: ConfigService,
  ) {}

  async captureWebTouch(dto: CaptureMarketingWebTouchDto) {
    const touch = await this.capture.captureTrustedTouch({
      campaignCode: dto.campaignCode,
      channel: MarketingTouchChannel.WEB,
      sourceEventKey: `web:${dto.launchKey}`,
      visitorKeyHash: this.visitorKeyHash(dto.visitorToken),
    });
    if (!touch) {
      return { accepted: false, targetPath: null };
    }

    const campaign = await this.prisma.marketingCampaign.findUnique({
      where: { id: touch.campaignId },
      select: { targetPath: true },
    });
    return { accepted: true, targetPath: campaign?.targetPath ?? null };
  }

  async claimWebTouches(userId: string, dto: ClaimMarketingWebTouchesDto) {
    const visitorKeyHash = dto.visitorToken
      ? this.visitorKeyHash(dto.visitorToken)
      : null;

    return this.prisma.$transaction(
      async (tx) => {
        const claimedTouches = visitorKeyHash
          ? await tx.$queryRaw<ClaimedWebTouch[]>`
              UPDATE "marketing_touches"
              SET "userId" = ${userId}, "visitorKeyHash" = NULL
              WHERE "channel" = 'WEB'::"MarketingTouchChannel"
                AND "visitorKeyHash" = ${visitorKeyHash}
                AND "userId" IS NULL
              RETURNING "id", "userId", "occurredAt"
            `
          : [];

        for (const touch of claimedTouches) {
          await this.lifecycle.recordCurrentTouch(tx, { userId, touch });
        }

        const registrationFinalized =
          await this.lifecycle.finalizeRegistrationAttributionForNewUser(tx, userId);

        return {
          claimedTouches: claimedTouches.length,
          registrationFinalized,
        };
      },
      {
        maxWait: CLAIM_TRANSACTION_MAX_WAIT_MS,
        timeout: CLAIM_TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  private visitorKeyHash(visitorToken: string) {
    const secret = this.config.get<string>('MARKETING_ATTRIBUTION_VISITOR_HMAC_SECRET');
    if (!secret?.trim()) {
      throw new InternalServerErrorException(
        'Не настроен секрет HMAC для маркетинговой атрибуции',
      );
    }

    return createHmac('sha256', secret).update(visitorToken).digest('hex');
  }
}
