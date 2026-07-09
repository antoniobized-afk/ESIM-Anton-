import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  CompletionAccountingStatus,
  OrderStatus,
  Prisma,
  PromoCodeRedemptionSource,
  ReferralPayoutMode,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { ReferralsService } from '../referrals/referrals.service';
import { PartnerRewardsService } from '../referrals/partner-rewards.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

type PurchaseAccountingOrder = {
  id: string;
  userId: string;
  status: OrderStatus;
  parentOrderId?: string | null;
  totalAmount: Prisma.Decimal | number;
  completionAccountingStatus: CompletionAccountingStatus;
  completionAccountingAppliedAt?: Date | null;
  completionAccountingNextRetryAt?: Date | null;
  user: {
    totalSpent: Prisma.Decimal | number;
    referralLinkId?: string | null;
    referredById?: string | null;
  };
  promoCodeRedemption?: {
    promoCodeId: string;
    source: PromoCodeRedemptionSource;
    rewardOwnerIdSnapshot: string | null;
    rewardBonusPercentSnapshot: Prisma.Decimal | number | string | null;
    rewardPayoutModeSnapshot: ReferralPayoutMode | null;
  } | null;
};

type ResolvedLoyaltyLevel = {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discount: number;
} | null;

export type CompletionAccountingAttemptResult = {
  orderId: string;
  status: CompletionAccountingStatus;
  applied: boolean;
  reason:
    | 'applied'
    | 'already_applied'
    | 'failed'
    | 'not_completed'
    | 'not_required'
    | 'not_due'
    | 'not_claimed';
  error?: string;
};

@Injectable()
export class OrderCompletionAccountingService {
  private readonly logger = new Logger(OrderCompletionAccountingService.name);
  private readonly enabled: boolean;
  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly referralsService: ReferralsService,
    private readonly partnerRewardsService: PartnerRewardsService,
    private readonly loyaltyService: LoyaltyService,
    private readonly configService: ConfigService,
  ) {
    this.enabled =
      this.configService.get('ORDER_COMPLETION_ACCOUNTING_RETRY_ENABLED') !== 'false';
    this.batchSize = this.parseBatchSize(
      this.configService.get('ORDER_COMPLETION_ACCOUNTING_RETRY_BATCH_SIZE'),
    );
  }

  private parseBatchSize(value: unknown) {
    const parsed = Number(value ?? 20);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(100, Math.max(1, Math.trunc(parsed)));
  }

  @Cron('*/30 * * * * *')
  async retryPendingAccounting() {
    if (!this.enabled) return;

    const now = new Date();
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        parentOrderId: null,
        completionAccountingStatus: {
          in: [
            CompletionAccountingStatus.PENDING,
            CompletionAccountingStatus.FAILED,
          ],
        },
        OR: [
          { completionAccountingNextRetryAt: null },
          { completionAccountingNextRetryAt: { lte: now } },
        ],
      },
      orderBy: [
        { completionAccountingNextRetryAt: 'asc' },
        { completedAt: 'asc' },
      ],
      take: this.batchSize,
      select: { id: true },
    });

    for (const order of orders) {
      try {
        await this.attemptPurchaseAccounting(order.id);
      } catch (error: any) {
        this.logger.error(
          `Completion accounting retry crashed for order ${order.id}: ${error.message}`,
        );
      }
    }
  }

  async retryPurchaseAccounting(orderId: string) {
    return this.attemptPurchaseAccounting(orderId, { force: true });
  }

  async attemptPurchaseAccounting(
    orderId: string,
    options: { force?: boolean } = {},
  ): Promise<CompletionAccountingAttemptResult> {
    const order = await this.loadPurchaseAccountingOrder(orderId);
    const now = new Date();

    if (order.parentOrderId) {
      await this.markNotRequired(order.id);
      return {
        orderId,
        status: CompletionAccountingStatus.NOT_REQUIRED,
        applied: false,
        reason: 'not_required',
      };
    }

    if (order.status !== OrderStatus.COMPLETED) {
      return {
        orderId,
        status: order.completionAccountingStatus,
        applied: false,
        reason: 'not_completed',
      };
    }

    if (order.completionAccountingAppliedAt) {
      await this.markApplied(order.id);
      return {
        orderId,
        status: CompletionAccountingStatus.APPLIED,
        applied: false,
        reason: 'already_applied',
      };
    }

    if (order.completionAccountingStatus === CompletionAccountingStatus.NOT_REQUIRED) {
      return {
        orderId,
        status: CompletionAccountingStatus.NOT_REQUIRED,
        applied: false,
        reason: 'not_required',
      };
    }

    if (
      !options.force &&
      order.completionAccountingNextRetryAt &&
      order.completionAccountingNextRetryAt > now
    ) {
      return {
        orderId,
        status: order.completionAccountingStatus,
        applied: false,
        reason: 'not_due',
      };
    }

    const claimed = await this.claimAttempt(order.id, now, Boolean(options.force));
    if (claimed.count !== 1) {
      return {
        orderId,
        status: order.completionAccountingStatus,
        applied: false,
        reason: 'not_claimed',
      };
    }

    const claimedOrder = await this.loadPurchaseAccountingOrder(orderId);

    try {
      const result = await this.applyPurchaseCompletionEffects(claimedOrder);
      await this.markApplied(orderId);
      return {
        orderId,
        status: CompletionAccountingStatus.APPLIED,
        applied: result.applied,
        reason: result.applied ? 'applied' : 'already_applied',
      };
    } catch (error: any) {
      const message = this.formatError(error);
      await this.markFailed(orderId, message);
      this.logger.warn(
        `Completion accounting for ${orderId} failed: ${message}`,
      );
      return {
        orderId,
        status: CompletionAccountingStatus.FAILED,
        applied: false,
        reason: 'failed',
        error: message,
      };
    }
  }

  private async claimAttempt(orderId: string, now: Date, force: boolean) {
    return this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: OrderStatus.COMPLETED,
        parentOrderId: null,
        completionAccountingAppliedAt: null,
        completionAccountingStatus: {
          in: [
            CompletionAccountingStatus.PENDING,
            CompletionAccountingStatus.FAILED,
          ],
        },
        ...(force
          ? {}
          : {
              OR: [
                { completionAccountingNextRetryAt: null },
                { completionAccountingNextRetryAt: { lte: now } },
              ],
            }),
      },
      data: {
        completionAccountingStatus: CompletionAccountingStatus.PENDING,
        completionAccountingAttempts: { increment: 1 },
        completionAccountingLastAttemptAt: now,
        completionAccountingLastError: null,
      },
    });
  }

  private async markApplied(orderId: string) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        completionAccountingStatus: CompletionAccountingStatus.APPLIED,
        completionAccountingNextRetryAt: null,
        completionAccountingLastError: null,
      },
    });
  }

  private async markNotRequired(orderId: string) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        completionAccountingStatus: CompletionAccountingStatus.NOT_REQUIRED,
        completionAccountingNextRetryAt: null,
        completionAccountingLastError: null,
      },
    });
  }

  private async markFailed(orderId: string, message: string) {
    const state = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { completionAccountingAttempts: true },
    });
    const attempts = state?.completionAccountingAttempts ?? 1;

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        completionAccountingStatus: CompletionAccountingStatus.FAILED,
        completionAccountingLastError: message,
        completionAccountingNextRetryAt: this.getNextRetryAt(attempts),
      },
    });
  }

  private getNextRetryAt(attempts: number) {
    const delaySeconds = Math.min(
      60 * 60,
      60 * 2 ** Math.max(0, attempts - 1),
    );
    return new Date(Date.now() + delaySeconds * 1000);
  }

  private formatError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Completion accounting failed';
    return message.slice(0, 1000);
  }

  private async getEffectiveLoyaltyLevel(totalSpent: number): Promise<ResolvedLoyaltyLevel> {
    return this.loyaltyService.getEffectiveLevelForSpent(totalSpent);
  }

  private async loadPurchaseAccountingOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        parentOrderId: true,
        totalAmount: true,
        completionAccountingStatus: true,
        completionAccountingAppliedAt: true,
        completionAccountingNextRetryAt: true,
        user: {
          select: {
            totalSpent: true,
            referralLinkId: true,
            referredById: true,
          },
        },
        promoCodeRedemption: {
          select: {
            promoCodeId: true,
            source: true,
            rewardOwnerIdSnapshot: true,
            rewardBonusPercentSnapshot: true,
            rewardPayoutModeSnapshot: true,
          },
        },
      },
    });

    if (!order) {
      throw new BadRequestException('Заказ не найден');
    }

    return order;
  }

  private async applyPurchaseCompletionEffects(order: PurchaseAccountingOrder) {
    const currentLoyaltyLevel = await this.getEffectiveLoyaltyLevel(
      Number(order.user.totalSpent),
    );

    const manualPartnerPromoReward = this.resolveManualPartnerPromoReward(order);
    const manualPartnerPromoBlocksReferral = Boolean(
      order.promoCodeRedemption?.source === PromoCodeRedemptionSource.MANUAL &&
        order.promoCodeRedemption.rewardOwnerIdSnapshot,
    );

    let referralContext: {
      settings: { enabled: boolean; bonusPercent: number; minPayout: number };
      referralLink: { id: string; bonusPercent: any; payoutMode: any } | null;
    } | null = null;

    if (!manualPartnerPromoBlocksReferral && order.user.referredById) {
      const [settings, referralLink] = await Promise.all([
        this.systemSettingsService.getReferralSettings(),
        order.user.referralLinkId
          ? this.prisma.referralLink.findUnique({
              where: { id: order.user.referralLinkId },
              select: { id: true, bonusPercent: true, payoutMode: true },
            })
          : Promise.resolve(null),
      ]);
      referralContext = { settings, referralLink };
    }

    const accountingApplied = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.COMPLETED,
          completionAccountingAppliedAt: null,
        },
        data: {
          completionAccountingAppliedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        return false;
      }

      if (currentLoyaltyLevel) {
        const cashback =
          (Number(order.totalAmount) * Number(currentLoyaltyLevel.cashbackPercent)) / 100;

        if (cashback > 0) {
          await tx.user.update({
            where: { id: order.userId },
            data: {
              bonusBalance: { increment: cashback },
            },
          });

          await tx.transaction.create({
            data: {
              userId: order.userId,
              orderId: order.id,
              type: TransactionType.BONUS_ACCRUAL,
              status: TransactionStatus.SUCCEEDED,
              amount: new Prisma.Decimal(cashback),
              metadata: {
                source: 'loyalty_cashback',
                cashbackPercent: Number(currentLoyaltyLevel.cashbackPercent),
              },
            },
          });
        }
      }

      await tx.user.update({
        where: { id: order.userId },
        data: { totalSpent: { increment: order.totalAmount } },
      });

      await this.loyaltyService.updateUserLevel(order.userId, tx);

      if (manualPartnerPromoReward) {
        await this.partnerRewardsService.award({
          ownerId: manualPartnerPromoReward.ownerId,
          orderAmount: Number(order.totalAmount),
          orderId: order.id,
          source: {
            kind: 'partner_promo_code',
            promoCodeId: manualPartnerPromoReward.promoCodeId,
            bonusPercent: manualPartnerPromoReward.bonusPercent,
            payoutMode: manualPartnerPromoReward.payoutMode,
          },
          client: tx,
        });
      } else if (
        !manualPartnerPromoBlocksReferral &&
        order.user.referredById &&
        referralContext
      ) {
        await this.referralsService.awardReferralBonus(
          order.user.referredById,
          Number(order.totalAmount),
          order.id,
          order.user.referralLinkId ?? null,
          tx,
          referralContext,
        );
      }

      return true;
    });

    if (!accountingApplied) {
      return { applied: false };
    }

    return { applied: true };
  }

  private resolveManualPartnerPromoReward(order: PurchaseAccountingOrder) {
    const redemption = order.promoCodeRedemption;

    if (
      !redemption ||
      redemption.source !== PromoCodeRedemptionSource.MANUAL ||
      !redemption.rewardOwnerIdSnapshot
    ) {
      return null;
    }

    if (redemption.rewardOwnerIdSnapshot === order.userId) {
      return null;
    }

    if (
      !redemption.rewardBonusPercentSnapshot ||
      !redemption.rewardPayoutModeSnapshot
    ) {
      throw new BadRequestException(
        'Партнёрский промокод имеет неполный reward snapshot',
      );
    }

    return {
      ownerId: redemption.rewardOwnerIdSnapshot,
      promoCodeId: redemption.promoCodeId,
      bonusPercent: redemption.rewardBonusPercentSnapshot,
      payoutMode: redemption.rewardPayoutModeSnapshot,
    };
  }
}
