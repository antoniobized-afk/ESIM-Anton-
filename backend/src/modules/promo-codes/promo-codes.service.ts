import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  Prisma,
  PromoCodeRedemptionSource,
  PromoCodeRedemptionStatus,
  ReferralPayoutMode,
} from '@prisma/client';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';

type PrismaLikeClient = Prisma.TransactionClient | PrismaService;
type PartnerRewardPolicyInput = Pick<
  CreatePromoCodeDto | UpdatePromoCodeDto,
  'referralOwnerId' | 'referralBonusPercent' | 'referralPayoutMode'
>;

type ReservationRewardPolicy = {
  ownerId: string;
  bonusPercent: Prisma.Decimal;
  payoutMode: ReferralPayoutMode;
} | null;

@Injectable()
export class PromoCodesService {
  constructor(private prisma: PrismaService) {}

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private hasRewardValue(value: unknown) {
    return value !== undefined && value !== null;
  }

  private isOwnerRemoval(value: unknown) {
    return value === null;
  }

  private validatePartnerRewardPolicyBlock(
    input: PartnerRewardPolicyInput,
    mode: 'create' | 'update',
  ) {
    const hasOwner = this.hasRewardValue(input.referralOwnerId);
    const hasBonusPercent = this.hasRewardValue(input.referralBonusPercent);
    const hasPayoutMode = this.hasRewardValue(input.referralPayoutMode);
    const hasAnyRewardField = hasOwner || hasBonusPercent || hasPayoutMode;

    if (mode === 'update' && this.isOwnerRemoval(input.referralOwnerId)) {
      if (hasBonusPercent || hasPayoutMode) {
        throw new BadRequestException(
          'При снятии владельца промокода не передавайте referralBonusPercent/referralPayoutMode',
        );
      }

      return { action: 'clear' as const };
    }

    if (!hasAnyRewardField) {
      return { action: 'none' as const };
    }

    if (!hasOwner || !hasBonusPercent || !hasPayoutMode) {
      throw new BadRequestException(
        'referralOwnerId, referralBonusPercent и referralPayoutMode должны передаваться вместе',
      );
    }

    return { action: 'set' as const };
  }

  private async assertRewardOwnerExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Владелец партнёрского промокода не найден');
    }
  }

  private async loadValidPromo(
    client: PrismaLikeClient,
    code: string,
  ) {
    const promo = await client.promoCode.findUnique({
      where: { code },
    });

    if (!promo) {
      throw new NotFoundException('Промокод не найден');
    }

    if (!promo.isActive) {
      throw new BadRequestException('Промокод деактивирован');
    }

    if (promo.expiresAt && promo.expiresAt < new Date()) {
      throw new BadRequestException('Срок действия промокода истёк');
    }

    return promo;
  }

  private buildReservationRewardPolicy(promo: {
    referralOwnerId?: string | null;
    referralBonusPercent?: Prisma.Decimal | null;
    referralPayoutMode?: ReferralPayoutMode | null;
  }): ReservationRewardPolicy {
    if (!promo.referralOwnerId) {
      return null;
    }

    if (!promo.referralBonusPercent || !promo.referralPayoutMode) {
      throw new BadRequestException(
        'Партнёрский промокод имеет неполную reward policy',
      );
    }

    return {
      ownerId: promo.referralOwnerId,
      bonusPercent: promo.referralBonusPercent,
      payoutMode: promo.referralPayoutMode,
    };
  }

  async create(data: CreatePromoCodeDto) {
    const normalized = this.normalizeCode(data.code);
    const rewardPolicy = this.validatePartnerRewardPolicyBlock(data, 'create');

    const existing = await this.prisma.promoCode.findUnique({
      where: { code: normalized },
    });
    if (existing) {
      throw new BadRequestException(`Промокод "${normalized}" уже существует`);
    }

    if (rewardPolicy.action === 'set') {
      await this.assertRewardOwnerExists(data.referralOwnerId!);
    }

    return this.prisma.promoCode.create({
      data: {
        code: normalized,
        discountPercent: data.discountPercent,
        maxUses: data.maxUses ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isActive: data.isActive ?? true,
        referralOwnerId:
          rewardPolicy.action === 'set' ? data.referralOwnerId! : null,
        referralBonusPercent:
          rewardPolicy.action === 'set'
            ? new Prisma.Decimal(data.referralBonusPercent!)
            : null,
        referralPayoutMode:
          rewardPolicy.action === 'set'
            ? data.referralPayoutMode!
            : null,
      },
    });
  }

  async findAll() {
    return this.prisma.promoCode.findMany({
      include: {
        referralOwner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
            referralCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async validate(code: string) {
    const reservation = await this.validateForReservation(code);

    return {
      valid: reservation.valid,
      promoId: reservation.promoId,
      code: reservation.code,
      discountPercent: reservation.discountPercent,
    };
  }

  async validateForReservation(code: string) {
    const normalized = this.normalizeCode(code);
    const promo = await this.loadValidPromo(this.prisma, normalized);

    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException('Промокод исчерпан');
    }

    return {
      valid: true,
      promoId: promo.id,
      code: promo.code,
      discountPercent: promo.discountPercent,
      partnerRewardPolicy: this.buildReservationRewardPolicy(promo),
    };
  }

  async reserveForOrder(
    code: string,
    userId: string,
    orderId: string,
    source: PromoCodeRedemptionSource,
    client?: PrismaLikeClient,
  ) {
    const normalized = this.normalizeCode(code);
    const executor = client ?? this.prisma;

    const run = async (tx: PrismaLikeClient) => {
      const promo = await this.loadValidPromo(tx, normalized);
      await tx.$queryRaw`SELECT id FROM promo_codes WHERE id = ${promo.id} FOR UPDATE`;

      const lockedPromo = await tx.promoCode.findUnique({
        where: { id: promo.id },
      });

      if (!lockedPromo) {
        throw new NotFoundException('Промокод не найден');
      }

      const reservedCount = await tx.promoCodeRedemption.count({
        where: {
          promoCodeId: promo.id,
          status: PromoCodeRedemptionStatus.RESERVED,
        },
      });

      if (
        lockedPromo.maxUses !== null &&
        lockedPromo.usedCount + reservedCount >= lockedPromo.maxUses
      ) {
        throw new BadRequestException('Промокод исчерпан');
      }

      const rewardPolicy = this.buildReservationRewardPolicy(lockedPromo);

      return tx.promoCodeRedemption.create({
        data: {
          promoCodeId: promo.id,
          userId,
          orderId,
          source,
          status: PromoCodeRedemptionStatus.RESERVED,
          rewardOwnerIdSnapshot: rewardPolicy?.ownerId ?? null,
          rewardBonusPercentSnapshot: rewardPolicy?.bonusPercent ?? null,
          rewardPayoutModeSnapshot: rewardPolicy?.payoutMode ?? null,
        },
      });
    };

    if (client) {
      return run(executor);
    }

    return this.prisma.$transaction((tx) => run(tx));
  }

  async consumeReservation(orderId: string, client?: PrismaLikeClient) {
    const run = async (tx: PrismaLikeClient) => {
      const redemption = await tx.promoCodeRedemption.findUnique({
        where: { orderId },
        include: {
          promoCode: true,
        },
      });

      if (!redemption) {
        return { consumed: false, status: null as PromoCodeRedemptionStatus | null };
      }

      if (redemption.status !== PromoCodeRedemptionStatus.RESERVED) {
        return { consumed: false, status: redemption.status };
      }

      await tx.$queryRaw`SELECT id FROM promo_codes WHERE id = ${redemption.promoCodeId} FOR UPDATE`;

      await tx.promoCode.update({
        where: { id: redemption.promoCodeId },
        data: {
          usedCount: { increment: 1 },
        },
      });

      await tx.promoCodeRedemption.update({
        where: { id: redemption.id },
        data: {
          status: PromoCodeRedemptionStatus.CONSUMED,
          consumedAt: new Date(),
        },
      });

      return { consumed: true, status: PromoCodeRedemptionStatus.CONSUMED };
    };

    if (client) {
      return run(client);
    }

    return this.prisma.$transaction((tx) => run(tx));
  }

  async releaseReservation(orderId: string, client?: PrismaLikeClient) {
    const run = async (tx: PrismaLikeClient) => {
      const redemption = await tx.promoCodeRedemption.findUnique({
        where: { orderId },
        select: {
          id: true,
          status: true,
        },
      });

      if (!redemption) {
        return { released: false, status: null as PromoCodeRedemptionStatus | null };
      }

      if (redemption.status !== PromoCodeRedemptionStatus.RESERVED) {
        return { released: false, status: redemption.status };
      }

      await tx.promoCodeRedemption.update({
        where: { id: redemption.id },
        data: {
          status: PromoCodeRedemptionStatus.RELEASED,
          releasedAt: new Date(),
        },
      });

      return { released: true, status: PromoCodeRedemptionStatus.RELEASED };
    };

    if (client) {
      return run(client);
    }

    return this.prisma.$transaction((tx) => run(tx));
  }

  async toggleActive(id: string, isActive: boolean) {
    return this.prisma.promoCode.update({
      where: { id },
      data: { isActive },
    });
  }

  async update(id: string, data: UpdatePromoCodeDto) {
    const existing = await this.prisma.promoCode.findUnique({
      where: { id },
      select: { id: true, code: true },
    });

    if (!existing) {
      throw new NotFoundException('Промокод не найден');
    }

    const updateData: Prisma.PromoCodeUpdateInput = {};

    if (data.code !== undefined) {
      const normalized = this.normalizeCode(data.code);
      if (normalized !== existing.code) {
        const duplicate = await this.prisma.promoCode.findUnique({
          where: { code: normalized },
          select: { id: true },
        });

        if (duplicate) {
          throw new BadRequestException(`Промокод "${normalized}" уже существует`);
        }
      }
      updateData.code = normalized;
    }

    if (data.discountPercent !== undefined) {
      updateData.discountPercent = data.discountPercent;
    }

    if (data.maxUses !== undefined) {
      updateData.maxUses = data.maxUses;
    }

    if (data.expiresAt !== undefined) {
      updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    const rewardPolicy = this.validatePartnerRewardPolicyBlock(data, 'update');

    if (rewardPolicy.action === 'clear') {
      updateData.referralOwner = { disconnect: true };
      updateData.referralBonusPercent = null;
      updateData.referralPayoutMode = null;
    }

    if (rewardPolicy.action === 'set') {
      await this.assertRewardOwnerExists(data.referralOwnerId!);
      updateData.referralOwner = { connect: { id: data.referralOwnerId! } };
      updateData.referralBonusPercent = new Prisma.Decimal(
        data.referralBonusPercent!,
      );
      updateData.referralPayoutMode =
        data.referralPayoutMode ?? ReferralPayoutMode.BALANCE;
    }

    return this.prisma.promoCode.update({
      where: { id },
      data: updateData,
      include: {
        referralOwner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
            referralCode: true,
          },
        },
      },
    });
  }

  async delete(id: string) {
    return this.prisma.promoCode.delete({ where: { id } });
  }
}
