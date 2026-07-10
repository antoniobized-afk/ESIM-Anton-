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

type MarketingTouchSnapshot = {
  touchId: string;
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
  channel: TouchWithCampaign['channel'];
  occurredAt: Date;
};

type RegistrationSnapshotPrefix = 'registrationFirst' | 'registrationLast';
type OrderSnapshotPrefix = 'first' | 'last';
type SnapshotPrefix = RegistrationSnapshotPrefix | OrderSnapshotPrefix;
type CurrentTouch = Pick<MarketingTouch, 'id' | 'userId' | 'occurredAt'>;

@Injectable()
export class MarketingAttributionLifecycleService {
  async initializeRegistrationAttributionForNewUser(
    tx: MarketingAttributionTransaction,
    userId: string,
  ) {
    return tx.userMarketingAttribution.create({
      data: {
        userId,
        registrationEligibleAt: new Date(),
      },
    });
  }

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
    input: { userId: string; touch: CurrentTouch },
  ) {
    const { touch } = input;
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

    return this.finalizeRegistrationSnapshot(tx, userId);
  }

  async finalizeRegistrationAttributionForNewUser(
    tx: MarketingAttributionTransaction,
    userId: string,
  ) {
    const state = await tx.userMarketingAttribution.findUnique({
      where: { userId },
      select: { id: true, registrationEligibleAt: true },
    });
    if (!state?.registrationEligibleAt) {
      return false;
    }

    await this.finalizeRegistrationSnapshot(tx, userId);
    return true;
  }

  private async finalizeRegistrationSnapshot(
    tx: MarketingAttributionTransaction,
    userId: string,
  ) {

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
        registrationEligibleAt: null,
        ...this.registrationSnapshotData('registrationFirst', first),
        ...this.registrationSnapshotData('registrationLast', last),
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
        ...this.orderSnapshotData('first', first),
        ...this.orderSnapshotData('last', last),
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

  private snapshot(touch: TouchWithCampaign | null | undefined): MarketingTouchSnapshot | null {
    if (!touch) {
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

  private registrationSnapshotData(
    prefix: RegistrationSnapshotPrefix,
    snapshot: MarketingTouchSnapshot | null,
  ) {
    return this.snapshotData(prefix, snapshot) as Prisma.UserMarketingAttributionUpdateManyMutationInput;
  }

  private orderSnapshotData(prefix: OrderSnapshotPrefix, snapshot: MarketingTouchSnapshot | null) {
    return this.snapshotData(prefix, snapshot) as Partial<Prisma.OrderMarketingAttributionUncheckedCreateInput>;
  }

  private snapshotData(prefix: SnapshotPrefix, snapshot: MarketingTouchSnapshot | null) {
    return {
      [`${prefix}TouchId`]: snapshot?.touchId ?? null,
      [`${prefix}CampaignId`]: snapshot?.campaignId ?? null,
      [`${prefix}CampaignCode`]: snapshot?.campaignCode ?? null,
      [`${prefix}CampaignName`]: snapshot?.campaignName ?? null,
      [`${prefix}UtmSource`]: snapshot?.utmSource ?? null,
      [`${prefix}UtmMedium`]: snapshot?.utmMedium ?? null,
      [`${prefix}UtmCampaign`]: snapshot?.utmCampaign ?? null,
      [`${prefix}UtmContent`]: snapshot?.utmContent ?? null,
      [`${prefix}UtmTerm`]: snapshot?.utmTerm ?? null,
      [`${prefix}Channel`]: snapshot?.channel ?? null,
      [`${prefix}OccurredAt`]: snapshot?.occurredAt ?? null,
    };
  }
}
