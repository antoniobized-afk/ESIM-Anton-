import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReferralPayoutMode,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '@/common/prisma/prisma.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

type PrismaLikeClient = Prisma.TransactionClient | PrismaService;

export type PartnerRewardSettings = {
  enabled: boolean;
  bonusPercent: number;
  minPayout: number;
};

export type PartnerRewardSource =
  | {
      kind: 'referral_link';
      referralLinkId: string;
      bonusPercent: Prisma.Decimal.Value;
      payoutMode: ReferralPayoutMode;
    }
  | {
      kind: 'legacy_referral';
      bonusPercent: Prisma.Decimal.Value;
      payoutMode?: ReferralPayoutMode;
    }
  | {
      kind: 'partner_promo_code';
      promoCodeId: string;
      bonusPercent: Prisma.Decimal.Value;
      payoutMode: ReferralPayoutMode;
    }
  | {
      kind: 'manual_award';
      bonusPercent: Prisma.Decimal.Value;
      payoutMode?: ReferralPayoutMode;
    };

export type AwardPartnerRewardInput = {
  ownerId: string;
  orderAmount: number;
  orderId?: string;
  source: PartnerRewardSource;
  settings?: PartnerRewardSettings;
  client?: PrismaLikeClient;
};

type AwardPartnerRewardResult = {
  awarded: boolean;
  reason?: 'disabled' | 'zero-bonus' | 'already-awarded';
  bonusAmount: number;
};

@Injectable()
export class PartnerRewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  private resolvePayoutMode(source: PartnerRewardSource) {
    return source.payoutMode ?? ReferralPayoutMode.BALANCE;
  }

  private resolveLedgerSource(source: PartnerRewardSource) {
    switch (source.kind) {
      case 'partner_promo_code':
        return 'partner_promo_code';
      case 'referral_link':
        return 'referral_link';
      case 'legacy_referral':
        return 'legacy_referral';
      case 'manual_award':
      default:
        return 'manual_award';
    }
  }

  private resolveReferralLinkId(source: PartnerRewardSource) {
    return source.kind === 'referral_link' ? source.referralLinkId : null;
  }

  private resolvePromoCodeId(source: PartnerRewardSource) {
    return source.kind === 'partner_promo_code' ? source.promoCodeId : null;
  }

  async award(input: AwardPartnerRewardInput): Promise<AwardPartnerRewardResult> {
    const settings =
      input.settings ?? (await this.systemSettingsService.getReferralSettings());

    if (!settings.enabled) {
      return { awarded: false, reason: 'disabled', bonusAmount: 0 };
    }

    const bonusPercent = new Prisma.Decimal(input.source.bonusPercent);
    const bonusAmount = new Prisma.Decimal(input.orderAmount)
      .mul(bonusPercent)
      .div(100)
      .toDecimalPlaces(2);

    if (bonusAmount.lte(0)) {
      return { awarded: false, reason: 'zero-bonus', bonusAmount: 0 };
    }

    const client = input.client ?? this.prisma;
    const payoutMode = this.resolvePayoutMode(input.source);
    const referralLinkId = this.resolveReferralLinkId(input.source);
    const promoCodeId = this.resolvePromoCodeId(input.source);
    const ledgerSource = this.resolveLedgerSource(input.source);

    const run = async (
      tx: Prisma.TransactionClient | PrismaService,
    ): Promise<AwardPartnerRewardResult> => {
      if (input.orderId) {
        const existingBonus = await tx.transaction.findFirst({
          where: {
            orderId: input.orderId,
            type: TransactionType.REFERRAL_BONUS,
            status: TransactionStatus.SUCCEEDED,
          },
        });

        if (existingBonus) {
          return {
            awarded: false,
            reason: 'already-awarded',
            bonusAmount: Number(existingBonus.amount),
          };
        }
      }

      if (payoutMode === ReferralPayoutMode.BALANCE) {
        await tx.user.update({
          where: { id: input.ownerId },
          data: {
            bonusBalance: {
              increment: bonusAmount,
            },
          },
        });
      }

      await tx.transaction.create({
        data: {
          userId: input.ownerId,
          orderId: input.orderId,
          referralLinkId,
          promoCodeId,
          type: TransactionType.REFERRAL_BONUS,
          status: TransactionStatus.SUCCEEDED,
          amount: bonusAmount,
          metadata: {
            orderAmount: input.orderAmount,
            bonusPercent: Number(bonusPercent),
            minPayout: settings.minPayout,
            payoutMode,
            source: ledgerSource,
          },
        },
      });

      return {
        awarded: true,
        bonusAmount: Number(bonusAmount),
      };
    };

    try {
      if (input.client) {
        return await run(client);
      }

      return await this.prisma.$transaction((tx) => run(tx));
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        input.orderId
      ) {
        const existingBonus = await this.prisma.transaction.findFirst({
          where: {
            orderId: input.orderId,
            type: TransactionType.REFERRAL_BONUS,
            status: TransactionStatus.SUCCEEDED,
          },
        });

        return {
          awarded: false,
          reason: 'already-awarded',
          bonusAmount: existingBonus ? Number(existingBonus.amount) : Number(bonusAmount),
        };
      }

      throw error;
    }
  }
}
