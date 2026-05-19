import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  Prisma,
  PromoCodeRedemptionSource,
  PromoCodeRedemptionStatus,
} from '@prisma/client';

type PrismaLikeClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class PromoCodesService {
  constructor(private prisma: PrismaService) {}

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
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

  async create(data: {
    code: string;
    discountPercent: number;
    maxUses?: number;
    expiresAt?: string;
  }) {
    const normalized = this.normalizeCode(data.code);

    const existing = await this.prisma.promoCode.findUnique({
      where: { code: normalized },
    });
    if (existing) {
      throw new BadRequestException(`Промокод "${normalized}" уже существует`);
    }

    return this.prisma.promoCode.create({
      data: {
        code: normalized,
        discountPercent: data.discountPercent,
        maxUses: data.maxUses ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
  }

  async findAll() {
    return this.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async validate(code: string) {
    return this.validateForReservation(code);
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

      return tx.promoCodeRedemption.create({
        data: {
          promoCodeId: promo.id,
          userId,
          orderId,
          source,
          status: PromoCodeRedemptionStatus.RESERVED,
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

  async delete(id: string) {
    return this.prisma.promoCode.delete({ where: { id } });
  }
}
