import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { MarketingTouchChannel, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MarketingAttributionLifecycleService } from './marketing-attribution-lifecycle.service';
import {
  MARKETING_CAMPAIGN_CODE_REGEX,
  MarketingAttributionTransaction,
  TrustedMarketingTouchInput,
} from './marketing-attribution.types';

type MarketingTouchWithCampaignCode = Prisma.MarketingTouchGetPayload<{
  include: { campaign: { select: { shortCode: true } } };
}>;

const CAPTURE_TRANSACTION_MAX_WAIT_MS = 10_000;
const CAPTURE_TRANSACTION_TIMEOUT_MS = 60_000;

@Injectable()
export class MarketingAttributionCaptureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: MarketingAttributionLifecycleService,
  ) {}

  async captureTrustedTouch(input: TrustedMarketingTouchInput) {
    this.validateInput(input);

    return this.prisma.$transaction(
      async (tx) => {
        const existingTouch = await this.findTouchBySourceEventKey(tx, input.sourceEventKey);
        if (existingTouch) {
          return this.acceptIdempotentTouch(tx, existingTouch, input);
        }

        const campaignCandidate = await tx.marketingCampaign.findUnique({
          where: { shortCode: input.campaignCode },
          select: { id: true },
        });

        if (!campaignCandidate) {
          return null;
        }

        // Captures держат совместимый lock; operator mutation с FOR UPDATE ждёт их commit.
        await tx.$queryRaw`SELECT "id" FROM "marketing_campaigns" WHERE "id" = ${campaignCandidate.id} FOR SHARE`;

        const touchAfterLock = await this.findTouchBySourceEventKey(tx, input.sourceEventKey);
        if (touchAfterLock) {
          return this.acceptIdempotentTouch(tx, touchAfterLock, input);
        }

        const campaign = await tx.marketingCampaign.findFirst({
          where: { id: campaignCandidate.id, isActive: true },
          select: { id: true },
        });

        if (!campaign) {
          return null;
        }

        await tx.marketingTouch.createMany({
          data: [
            {
              campaignId: campaign.id,
              userId: input.userId ?? null,
              channel: input.channel,
              sourceEventKey: input.sourceEventKey,
              visitorKeyHash: input.userId
                ? null
                : this.normalizeVisitorKeyHash(input.visitorKeyHash),
              occurredAt: input.occurredAt ?? new Date(),
            },
          ],
          skipDuplicates: true,
        });

        const touch = await this.findTouchBySourceEventKey(tx, input.sourceEventKey);
        if (!touch) {
          throw new ConflictException('Не удалось получить идемпотентное маркетинговое касание');
        }
        return this.acceptIdempotentTouch(tx, touch, input);
      },
      {
        maxWait: CAPTURE_TRANSACTION_MAX_WAIT_MS,
        timeout: CAPTURE_TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  private findTouchBySourceEventKey(
    tx: MarketingAttributionTransaction,
    sourceEventKey: string,
  ) {
    return tx.marketingTouch.findUnique({
      where: { sourceEventKey },
      include: { campaign: { select: { shortCode: true } } },
    });
  }

  private async acceptIdempotentTouch(
    tx: MarketingAttributionTransaction,
    touch: MarketingTouchWithCampaignCode,
    input: TrustedMarketingTouchInput,
  ) {
    this.assertSameEvent(touch, input);

    if (input.userId) {
      await this.lifecycle.recordCurrentTouch(tx, {
        userId: input.userId,
        touchId: touch.id,
      });
    }

    const { campaign, ...result } = touch;
    void campaign;
    return result;
  }

  private assertSameEvent(
    touch: MarketingTouchWithCampaignCode,
    input: TrustedMarketingTouchInput,
  ) {
    const occurredAtMismatch = input.occurredAt
      ? touch.occurredAt.getTime() !== input.occurredAt.getTime()
      : false;
    const identityMismatch =
      touch.campaign.shortCode !== input.campaignCode ||
      touch.channel !== input.channel ||
      occurredAtMismatch ||
      this.hasAssociationMismatch(touch, input);

    if (identityMismatch) {
      throw new ConflictException(
        'Ключ идемпотентности уже использован другим маркетинговым событием',
      );
    }
  }

  private hasAssociationMismatch(
    touch: MarketingTouchWithCampaignCode,
    input: TrustedMarketingTouchInput,
  ) {
    if (input.userId) {
      return touch.userId !== input.userId;
    }

    if (touch.userId !== null) {
      return true;
    }

    return (
      this.normalizeVisitorKeyHash(touch.visitorKeyHash) !==
        this.normalizeVisitorKeyHash(input.visitorKeyHash)
    );
  }

  private normalizeVisitorKeyHash(value: string | null | undefined) {
    return value?.toLowerCase() ?? null;
  }

  private validateInput(input: TrustedMarketingTouchInput) {
    const hasUser = Boolean(input.userId?.trim());
    const hasVisitor = Boolean(input.visitorKeyHash?.trim());

    if (!MARKETING_CAMPAIGN_CODE_REGEX.test(input.campaignCode)) {
      throw new BadRequestException('Некорректный код маркетинговой кампании');
    }
    if (!Object.values(MarketingTouchChannel).includes(input.channel)) {
      throw new BadRequestException('Некорректный канал маркетингового касания');
    }
    if (!/^[A-Za-z0-9:_-]{1,180}$/.test(input.sourceEventKey)) {
      throw new BadRequestException('Некорректный ключ идемпотентности маркетингового касания');
    }
    if (input.userId !== undefined && (!hasUser || input.userId !== input.userId.trim())) {
      throw new BadRequestException('userId должен быть canonical non-empty identifier');
    }
    if (input.visitorKeyHash !== undefined && !hasVisitor) {
      throw new BadRequestException('HMAC visitor key не может быть пустым');
    }
    if (hasUser === hasVisitor) {
      throw new BadRequestException(
        'Маркетинговому касанию нужен ровно один association: userId или HMAC visitor key',
      );
    }
    if (input.visitorKeyHash && !/^[a-f0-9]{64}$/i.test(input.visitorKeyHash)) {
      throw new BadRequestException('Некорректный HMAC visitor key');
    }
    if (input.occurredAt && Number.isNaN(input.occurredAt.getTime())) {
      throw new BadRequestException('Некорректное время маркетингового касания');
    }
  }
}
