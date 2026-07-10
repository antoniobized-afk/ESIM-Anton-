import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MarketingTouchChannel } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CaptureMarketingWebTouchDto } from './dto/capture-marketing-web-touch.dto';
import { ClaimMarketingWebTouchesDto } from './dto/claim-marketing-web-touches.dto';
import { MarketingAttributionCaptureService } from './marketing-attribution-capture.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import { ReferralsService } from '../referrals/referrals.service';

type ClaimedWebTouchSummary = {
  claimedTouches: number;
  firstTouchId: string | null;
  firstTouchOccurredAt: Date | null;
  lastTouchId: string | null;
  lastTouchOccurredAt: Date | null;
  lastReferralLinkId: string | null;
};

type ClaimedCurrentTouch = {
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
    private readonly referrals: ReferralsService,
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
        const claimSummary = visitorKeyHash
          ? (await tx.$queryRaw<ClaimedWebTouchSummary[]>`
              WITH claimed AS (
                UPDATE "marketing_touches"
                SET "userId" = ${userId}, "visitorKeyHash" = NULL
                WHERE "channel" = 'WEB'::"MarketingTouchChannel"
                  AND "visitorKeyHash" = ${visitorKeyHash}
                  AND "userId" IS NULL
                RETURNING "id", "occurredAt", "campaignId"
              )
              SELECT
                (SELECT COUNT(*)::int FROM claimed) AS "claimedTouches",
                (
                  SELECT "id" FROM claimed
                  ORDER BY "occurredAt" ASC, "id" ASC
                  LIMIT 1
                ) AS "firstTouchId",
                (
                  SELECT "occurredAt" FROM claimed
                  ORDER BY "occurredAt" ASC, "id" ASC
                  LIMIT 1
                ) AS "firstTouchOccurredAt",
                (
                  SELECT "id" FROM claimed
                  ORDER BY "occurredAt" DESC, "id" DESC
                  LIMIT 1
                ) AS "lastTouchId",
                (
                  SELECT "occurredAt" FROM claimed
                  ORDER BY "occurredAt" DESC, "id" DESC
                  LIMIT 1
                ) AS "lastTouchOccurredAt"
                ,(
                  SELECT campaign."referralLinkId"
                  FROM claimed
                  INNER JOIN "marketing_campaigns" AS campaign
                    ON campaign."id" = claimed."campaignId"
                  ORDER BY claimed."occurredAt" DESC, claimed."id" DESC
                  LIMIT 1
                ) AS "lastReferralLinkId"
            `)[0] ?? this.emptyClaimSummary()
          : this.emptyClaimSummary();

        for (const touch of this.currentTouchesFromClaim(userId, claimSummary)) {
          await this.lifecycle.recordCurrentTouch(tx, { userId, touch });
        }
        if (claimSummary.lastReferralLinkId) {
          await this.referrals.registerReferralLink(
            userId,
            claimSummary.lastReferralLinkId,
            tx,
          );
        }

        const registrationFinalized =
          await this.lifecycle.finalizeRegistrationAttributionForNewUser(tx, userId);

        return {
          claimedTouches: claimSummary.claimedTouches,
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

  private emptyClaimSummary(): ClaimedWebTouchSummary {
    return {
      claimedTouches: 0,
      firstTouchId: null,
      firstTouchOccurredAt: null,
      lastTouchId: null,
      lastTouchOccurredAt: null,
      lastReferralLinkId: null,
    };
  }

  private currentTouchesFromClaim(
    userId: string,
    summary: ClaimedWebTouchSummary,
  ): ClaimedCurrentTouch[] {
    if (!summary.firstTouchId || !summary.firstTouchOccurredAt) {
      return [];
    }

    const firstTouch = {
      id: summary.firstTouchId,
      userId,
      occurredAt: summary.firstTouchOccurredAt,
    };
    if (
      !summary.lastTouchId ||
      !summary.lastTouchOccurredAt ||
      summary.lastTouchId === firstTouch.id
    ) {
      return [firstTouch];
    }

    return [
      firstTouch,
      {
        id: summary.lastTouchId,
        userId,
        occurredAt: summary.lastTouchOccurredAt,
      },
    ];
  }
}
