import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MarketingRegistrationAttributionStatus,
  MarketingTouch,
  Prisma,
} from '@prisma/client';
import { MarketingAttributionTransaction } from './marketing-attribution.types';

type TouchWithCampaign = Prisma.MarketingTouchGetPayload<{
  include: { campaign: true };
}>;

@Injectable()
export class MarketingAttributionLifecycleService {
  async ensureRegistrationState(tx: MarketingAttributionTransaction, userId: string) {
    const existingState = await tx.userMarketingAttribution.findUnique({
      where: { userId },
    });
    if (existingState) {
      return existingState;
    }

    // Общая canonical user row сериализует только первичное создание one-to-one state.
    const lockedUsers = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "users" WHERE "id" = ${userId} FOR NO KEY UPDATE
    `;
    if (lockedUsers.length === 0) {
      throw new NotFoundException('Пользователь не найден');
    }

    const stateAfterLock = await tx.userMarketingAttribution.findUnique({
      where: { userId },
    });
    if (stateAfterLock) {
      return stateAfterLock;
    }

    return tx.userMarketingAttribution.create({ data: { userId } });
  }

  async recordCurrentTouch(
    tx: MarketingAttributionTransaction,
    input: { userId: string; touchId: string },
  ) {
    const touch = await tx.marketingTouch.findUnique({
      where: { id: input.touchId },
      select: { id: true, userId: true, occurredAt: true },
    });

    if (!touch) {
      throw new NotFoundException('Маркетинговое касание не найдено');
    }
    if (touch.userId !== input.userId) {
      throw new ForbiddenException('Касание нельзя связать с другим пользователем');
    }

    const state = await this.ensureRegistrationState(tx, input.userId);
    const earliest = await tx.userMarketingAttribution.updateMany({
      where: {
        id: state.id,
        OR: [
          { firstTouchOccurredAt: null },
          { firstTouchOccurredAt: { gt: touch.occurredAt } },
        ],
      },
      data: {
        firstTouchId: touch.id,
        firstTouchOccurredAt: touch.occurredAt,
      },
    });
    const latest = await tx.userMarketingAttribution.updateMany({
      where: {
        id: state.id,
        OR: [
          { lastTouchOccurredAt: null },
          { lastTouchOccurredAt: { lt: touch.occurredAt } },
        ],
      },
      data: {
        lastTouchId: touch.id,
        lastTouchOccurredAt: touch.occurredAt,
      },
    });

    return {
      stateId: state.id,
      firstTouchUpdated: earliest.count === 1,
      lastTouchUpdated: latest.count === 1,
    };
  }

  async finalizeRegistrationAttribution(tx: MarketingAttributionTransaction, userId: string) {
    await this.ensureRegistrationState(tx, userId);

    // Блокирует current first/last CAS до записи immutable registration snapshot.
    await tx.$queryRaw`SELECT "id" FROM "user_marketing_attribution" WHERE "userId" = ${userId} FOR UPDATE`;

    const state = await this.loadUserState(tx, userId);

    if (!state) {
      throw new NotFoundException('Состояние маркетинговой атрибуции пользователя не найдено');
    }
    if (state.registrationStatus !== MarketingRegistrationAttributionStatus.PENDING) {
      return state;
    }

    const first = this.snapshot(state.firstTouch);
    const last = this.snapshot(state.lastTouch);
    const status = first || last
      ? MarketingRegistrationAttributionStatus.ATTRIBUTED
      : MarketingRegistrationAttributionStatus.DIRECT;
    await tx.userMarketingAttribution.updateMany({
      where: {
        id: state.id,
        registrationStatus: MarketingRegistrationAttributionStatus.PENDING,
      },
      data: {
        registrationStatus: status,
        registrationFinalizedAt: new Date(),
        ...this.registrationFirstData(first),
        ...this.registrationLastData(last),
      },
    });

    return this.loadUserState(tx, userId);
  }

  async createOrderSnapshot(
    tx: MarketingAttributionTransaction,
    input: { orderId: string; userId: string },
  ) {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { userId: true, parentOrderId: true },
    });

    if (!order || order.userId !== input.userId) {
      throw new NotFoundException('Первичный заказ пользователя не найден');
    }
    if (order.parentOrderId !== null) {
      return null;
    }

    const state = await this.loadUserState(tx, input.userId);
    const first = this.snapshot(state?.firstTouch);
    const last = this.snapshot(state?.lastTouch);

    return tx.orderMarketingAttribution.upsert({
      where: { orderId: input.orderId },
      create: {
        orderId: input.orderId,
        ...this.orderFirstData(first),
        ...this.orderLastData(last),
      },
      update: {},
    });
  }

  private loadUserState(tx: MarketingAttributionTransaction, userId: string) {
    return tx.userMarketingAttribution.findUnique({
      where: { userId },
      include: {
        firstTouch: { include: { campaign: true } },
        lastTouch: { include: { campaign: true } },
      },
    });
  }

  private snapshot(touch: TouchWithCampaign | MarketingTouch | null | undefined) {
    if (!touch || !('campaign' in touch)) {
      return null;
    }

    return {
      touchId: touch.id,
      campaignId: touch.campaignId,
      campaignCode: touch.campaign.shortCode,
      campaignName: touch.campaign.name,
      utmSource: touch.campaign.utmSource,
      utmMedium: touch.campaign.utmMedium,
      utmCampaign: touch.campaign.utmCampaign,
      utmContent: touch.campaign.utmContent,
      utmTerm: touch.campaign.utmTerm,
      channel: touch.channel,
      occurredAt: touch.occurredAt,
    };
  }

  private registrationFirstData(snapshot: ReturnType<MarketingAttributionLifecycleService['snapshot']>) {
    return {
      registrationFirstTouchId: snapshot?.touchId ?? null,
      registrationFirstCampaignId: snapshot?.campaignId ?? null,
      registrationFirstCampaignCode: snapshot?.campaignCode ?? null,
      registrationFirstCampaignName: snapshot?.campaignName ?? null,
      registrationFirstUtmSource: snapshot?.utmSource ?? null,
      registrationFirstUtmMedium: snapshot?.utmMedium ?? null,
      registrationFirstUtmCampaign: snapshot?.utmCampaign ?? null,
      registrationFirstUtmContent: snapshot?.utmContent ?? null,
      registrationFirstUtmTerm: snapshot?.utmTerm ?? null,
      registrationFirstChannel: snapshot?.channel ?? null,
      registrationFirstOccurredAt: snapshot?.occurredAt ?? null,
    };
  }

  private registrationLastData(snapshot: ReturnType<MarketingAttributionLifecycleService['snapshot']>) {
    return {
      registrationLastTouchId: snapshot?.touchId ?? null,
      registrationLastCampaignId: snapshot?.campaignId ?? null,
      registrationLastCampaignCode: snapshot?.campaignCode ?? null,
      registrationLastCampaignName: snapshot?.campaignName ?? null,
      registrationLastUtmSource: snapshot?.utmSource ?? null,
      registrationLastUtmMedium: snapshot?.utmMedium ?? null,
      registrationLastUtmCampaign: snapshot?.utmCampaign ?? null,
      registrationLastUtmContent: snapshot?.utmContent ?? null,
      registrationLastUtmTerm: snapshot?.utmTerm ?? null,
      registrationLastChannel: snapshot?.channel ?? null,
      registrationLastOccurredAt: snapshot?.occurredAt ?? null,
    };
  }

  private orderFirstData(snapshot: ReturnType<MarketingAttributionLifecycleService['snapshot']>) {
    return {
      firstTouchId: snapshot?.touchId ?? null,
      firstCampaignId: snapshot?.campaignId ?? null,
      firstCampaignCode: snapshot?.campaignCode ?? null,
      firstCampaignName: snapshot?.campaignName ?? null,
      firstUtmSource: snapshot?.utmSource ?? null,
      firstUtmMedium: snapshot?.utmMedium ?? null,
      firstUtmCampaign: snapshot?.utmCampaign ?? null,
      firstUtmContent: snapshot?.utmContent ?? null,
      firstUtmTerm: snapshot?.utmTerm ?? null,
      firstChannel: snapshot?.channel ?? null,
      firstOccurredAt: snapshot?.occurredAt ?? null,
    };
  }

  private orderLastData(snapshot: ReturnType<MarketingAttributionLifecycleService['snapshot']>) {
    return {
      lastTouchId: snapshot?.touchId ?? null,
      lastCampaignId: snapshot?.campaignId ?? null,
      lastCampaignCode: snapshot?.campaignCode ?? null,
      lastCampaignName: snapshot?.campaignName ?? null,
      lastUtmSource: snapshot?.utmSource ?? null,
      lastUtmMedium: snapshot?.utmMedium ?? null,
      lastUtmCampaign: snapshot?.utmCampaign ?? null,
      lastUtmContent: snapshot?.utmContent ?? null,
      lastUtmTerm: snapshot?.utmTerm ?? null,
      lastChannel: snapshot?.channel ?? null,
      lastOccurredAt: snapshot?.occurredAt ?? null,
    };
  }
}
