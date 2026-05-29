import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  Prisma,
  ReferralPayoutMode,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { PartnerRewardsService, PartnerRewardSettings } from './partner-rewards.service';

type ReferralLinkCreateInput = {
  code?: string;
  userId: string;
  label?: string | null;
  bonusPercent: number;
  payoutMode?: ReferralPayoutMode;
  promoCodeId?: string | null;
  isActive?: boolean;
  expiresAt?: Date | string | null;
};

type ReferralLinkUpdateInput = {
  code?: string;
  label?: string | null;
  bonusPercent?: number;
  payoutMode?: ReferralPayoutMode;
  promoCodeId?: string | null;
  isActive?: boolean;
  expiresAt?: Date | string | null;
};

type ReferralLinksQuery = {
  page?: number;
  limit?: number;
  userId?: string;
  isActive?: boolean;
};

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private systemSettingsService: SystemSettingsService,
    private configService: ConfigService,
    private partnerRewardsService: PartnerRewardsService,
  ) { }

  private normalizeLookupCode(code: string) {
    return code.trim().toUpperCase();
  }

  private normalizeLegacyReferralCode(code: string) {
    return code.trim();
  }

  private validateReferralLinkCode(code: string) {
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      throw new BadRequestException(
        'Referral link code должен содержать 3-30 символов: A-Z, 0-9, "_" или "-"',
      );
    }
  }

  private parseOptionalDate(value?: Date | string | null) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректная дата истечения referral link');
    }

    return parsed;
  }

  private ensurePositiveBonusPercent(bonusPercent: number) {
    if (!Number.isFinite(bonusPercent) || bonusPercent <= 0) {
      throw new BadRequestException('bonusPercent должен быть больше 0');
    }

    return new Prisma.Decimal(bonusPercent);
  }

  private isReferralLinkActive(link: { isActive: boolean; expiresAt: Date | null }) {
    if (!link.isActive) {
      return false;
    }

    if (link.expiresAt && link.expiresAt <= new Date()) {
      return false;
    }

    return true;
  }

  private async assertReferralLinkCodeAvailable(
    code: string,
    excludeReferralLinkId?: string,
  ) {
    const [existingLink, existingUserCode] = await Promise.all([
      this.prisma.referralLink.findFirst({
        where: {
          code,
          ...(excludeReferralLinkId ? { id: { not: excludeReferralLinkId } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: {
          referralCode: {
            equals: code,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      }),
    ]);

    if (existingLink) {
      throw new BadRequestException(`Referral link code "${code}" уже существует`);
    }

    if (existingUserCode) {
      throw new BadRequestException(
        `Referral link code "${code}" конфликтует с существующим user referralCode`,
      );
    }
  }

  private async validateReferralLinkDependencies(input: {
    userId?: string;
    promoCodeId?: string | null;
  }) {
    if (input.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });

      if (!user) {
        throw new NotFoundException('Владелец referral link не найден');
      }
    }

    if (input.promoCodeId) {
      const promoCode = await this.prisma.promoCode.findUnique({
        where: { id: input.promoCodeId },
        select: { id: true },
      });

      if (!promoCode) {
        throw new NotFoundException('Промокод для referral link не найден');
      }
    }
  }

  /**
   * Создать partner referral link.
   */
  async createReferralLink(dto: ReferralLinkCreateInput) {
    const rawCode = dto.code?.trim();

    if (!rawCode) {
      throw new BadRequestException('code обязателен для referral link');
    }

    const code = this.normalizeLookupCode(rawCode);
    this.validateReferralLinkCode(code);

    await this.assertReferralLinkCodeAvailable(code);
    await this.validateReferralLinkDependencies({
      userId: dto.userId,
      promoCodeId: dto.promoCodeId ?? null,
    });

    return this.prisma.referralLink.create({
      data: {
        code,
        userId: dto.userId,
        label: dto.label?.trim() || null,
        bonusPercent: this.ensurePositiveBonusPercent(dto.bonusPercent),
        payoutMode: dto.payoutMode ?? ReferralPayoutMode.BALANCE,
        promoCodeId: dto.promoCodeId ?? null,
        isActive: dto.isActive ?? true,
        expiresAt: this.parseOptionalDate(dto.expiresAt) ?? null,
      },
      include: {
        promoCode: {
          select: { id: true, code: true },
        },
        user: {
          select: { id: true, referralCode: true, firstName: true, username: true },
        },
      },
    });
  }

  /**
   * Обновить partner referral link без смены владельца.
   */
  async updateReferralLink(id: string, dto: ReferralLinkUpdateInput) {
    const existing = await this.prisma.referralLink.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Referral link не найден');
    }

    const data: Prisma.ReferralLinkUpdateInput = {};

    if (dto.code !== undefined) {
      const rawCode = dto.code.trim();

      if (!rawCode) {
        throw new BadRequestException('code не может быть пустым');
      }

      const code = this.normalizeLookupCode(rawCode);
      this.validateReferralLinkCode(code);

      await this.assertReferralLinkCodeAvailable(code, id);
      data.code = code;
    }

    if (dto.bonusPercent !== undefined) {
      data.bonusPercent = this.ensurePositiveBonusPercent(dto.bonusPercent);
    }

    if (dto.promoCodeId !== undefined) {
      await this.validateReferralLinkDependencies({
        promoCodeId: dto.promoCodeId,
      });
      data.promoCode = dto.promoCodeId
        ? { connect: { id: dto.promoCodeId } }
        : { disconnect: true };
    }

    if (dto.label !== undefined) {
      data.label = dto.label?.trim() || null;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.expiresAt !== undefined) {
      data.expiresAt = this.parseOptionalDate(dto.expiresAt);
    }

    if (dto.payoutMode !== undefined) {
      data.payoutMode = dto.payoutMode;
    }

    return this.prisma.referralLink.update({
      where: { id },
      data,
      include: {
        promoCode: {
          select: { id: true, code: true },
        },
        user: {
          select: { id: true, referralCode: true, firstName: true, username: true },
        },
      },
    });
  }

  /**
   * Список partner referral links для admin/runtime domain.
   */
  async getReferralLinks(query: ReferralLinksQuery = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(query.limit ?? 20, 100));
    const skip = (page - 1) * limit;
    const where: Prisma.ReferralLinkWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.referralLink.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          promoCode: {
            select: { id: true, code: true, isActive: true, expiresAt: true },
          },
          user: {
            select: { id: true, referralCode: true, firstName: true, username: true },
          },
          _count: {
            select: {
              referredUsers: true,
              transactions: true,
            },
          },
        },
      }),
      this.prisma.referralLink.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Детальная analytics view по partner referral link.
   */
  async getReferralLinkStats(id: string) {
    const link = await this.prisma.referralLink.findUnique({
      where: { id },
      include: {
        promoCode: {
          select: {
            id: true,
            code: true,
            isActive: true,
            expiresAt: true,
            maxUses: true,
            usedCount: true,
          },
        },
        user: {
          select: { id: true, referralCode: true, firstName: true, username: true },
        },
      },
    });

    if (!link) {
      throw new NotFoundException('Referral link не найден');
    }

    const [registrations, primaryOrdersAggregate, totalReferrerEarnings, referredUsers] =
      await Promise.all([
        this.prisma.user.count({
          where: { referralLinkId: id },
        }),
        this.prisma.order.aggregate({
          where: {
            status: 'COMPLETED',
            parentOrderId: null,
            user: {
              referralLinkId: id,
            },
          },
          _count: {
            id: true,
          },
          _sum: {
            totalAmount: true,
          },
        }),
        this.prisma.transaction.aggregate({
          where: {
            referralLinkId: id,
            type: TransactionType.REFERRAL_BONUS,
            status: TransactionStatus.SUCCEEDED,
          },
          _sum: {
            amount: true,
          },
        }),
        this.prisma.user.findMany({
          where: { referralLinkId: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            username: true,
            firstName: true,
            createdAt: true,
            orders: {
              where: {
                status: 'COMPLETED',
                parentOrderId: null,
              },
              select: {
                totalAmount: true,
              },
            },
          },
        }),
      ]);

    return {
      link,
      stats: {
        registrations,
        ordersCount: primaryOrdersAggregate._count.id,
        commissionableRevenue:
          primaryOrdersAggregate._sum.totalAmount ?? new Prisma.Decimal(0),
        totalReferrerEarnings:
          totalReferrerEarnings._sum.amount ?? new Prisma.Decimal(0),
      },
      referredUsers: referredUsers.map((user) => ({
        id: user.id,
        name: user.firstName || user.username || 'Пользователь',
        joinedAt: user.createdAt,
        totalOrders: user.orders.length,
        totalSpent: user.orders.reduce(
          (sum, order) => sum.add(order.totalAmount),
          new Prisma.Decimal(0),
        ),
      })),
    };
  }

  /**
   * Публичная минимальная информация о partner referral link.
   */
  async getReferralLinkPublicInfo(code: string) {
    const normalizedCode = this.normalizeLookupCode(code);
    const link = await this.prisma.referralLink.findUnique({
      where: { code: normalizedCode },
      include: {
        promoCode: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!link) {
      return { isValid: false, promoCode: null };
    }

    return {
      isValid: this.isReferralLinkActive(link),
      promoCode: this.isReferralLinkActive(link) ? link.promoCode?.code ?? null : null,
    };
  }

  /**
   * Зарегистрировать реферала
   */
  async registerReferral(
    userId: string,
    referralCode: string,
    expectedTelegramId?: bigint,
  ) {
    const normalizedPartnerCode = this.normalizeLookupCode(referralCode);
    const normalizedLegacyUserCode = this.normalizeLegacyReferralCode(referralCode);

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referredById: true, referralLinkId: true, telegramId: true },
    });

    if (!currentUser) {
      return null;
    }

    if (
      expectedTelegramId !== undefined &&
      currentUser.telegramId !== expectedTelegramId
    ) {
      throw new ForbiddenException('Telegram identity mismatch');
    }

    if (currentUser.referredById && !currentUser.referralLinkId) {
      return null;
    }

    const existingCompletedPrimaryOrder = await this.prisma.order.findFirst({
      where: {
        userId,
        status: 'COMPLETED',
        parentOrderId: null,
      },
      select: { id: true },
    });

    if (existingCompletedPrimaryOrder) {
      return null;
    }

    const partnerLink = await this.prisma.referralLink.findUnique({
      where: { code: normalizedPartnerCode },
      include: {
        user: {
          select: { id: true, referralCode: true },
        },
      },
    });

    if (partnerLink) {
      if (!this.isReferralLinkActive(partnerLink)) {
        return null;
      }

      if (partnerLink.userId === userId) {
        return null;
      }

      if (
        currentUser.referredById === partnerLink.userId &&
        currentUser.referralLinkId === partnerLink.id
      ) {
        return partnerLink.user;
      }

      const result = await this.prisma.user.updateMany({
        where: {
          id: userId,
          OR: [
            { referredById: null },
            { referralLinkId: { not: null } },
          ],
        },
        data: {
          referredById: partnerLink.userId,
          referralLinkId: partnerLink.id,
        },
      });

      if (result.count === 0) {
        return null;
      }

      return partnerLink.user;
    }

    if (currentUser.referredById) {
      return null;
    }

    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: normalizedLegacyUserCode },
      select: { id: true, referralCode: true },
    });

    if (!referrer || referrer.id === userId) {
      return null;
    }

    const result = await this.prisma.user.updateMany({
      where: { id: userId, referredById: null },
      data: {
        referredById: referrer.id,
        referralLinkId: null,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return referrer;
  }

  /**
   * Начислить реферальный бонус.
   *
   * @param prefetched — если вызывается внутри interactive tx,
   *   передайте заранее загруженные settings и referralLink,
   *   чтобы не обращаться к this.prisma (connection pool deadlock).
   */
  async awardReferralBonus(
    referrerId: string,
    orderAmount: number,
    orderId?: string,
    referralLinkId?: string | null,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
    prefetched?: {
      settings: PartnerRewardSettings;
      referralLink: { id: string; bonusPercent: any; payoutMode: any } | null;
    },
  ) {
    const settings = prefetched?.settings
      ?? await this.systemSettingsService.getReferralSettings();

    if (!settings.enabled) {
      return { awarded: false, reason: 'disabled', bonusAmount: 0 };
    }

    let referralLink: { id: string; bonusPercent: any; payoutMode: any } | null;

    if (prefetched !== undefined) {
      // Pre-fetched path: data already resolved, skip all reads
      referralLink = prefetched.referralLink;
    } else {
      // Standalone path (admin/manual): resolve referralLink from DB
      let resolvedReferralLinkId = referralLinkId;

      if (resolvedReferralLinkId === undefined && orderId) {
        const order = await client.order.findUnique({
          where: { id: orderId },
          select: {
            user: {
              select: {
                referralLinkId: true,
              },
            },
          },
        });

        resolvedReferralLinkId = order?.user?.referralLinkId ?? null;
      }

      referralLink =
        resolvedReferralLinkId === null || resolvedReferralLinkId === undefined
          ? null
          : await client.referralLink.findUnique({
              where: { id: resolvedReferralLinkId },
              select: { id: true, bonusPercent: true, payoutMode: true },
            });

      if (resolvedReferralLinkId && !referralLink) {
        throw new NotFoundException('Referral link для начисления бонуса не найден');
      }
    }

    return this.partnerRewardsService.award({
      ownerId: referrerId,
      orderAmount,
      orderId,
      settings,
      client,
      source: referralLink
        ? {
            kind: 'referral_link',
            referralLinkId: referralLink.id,
            bonusPercent: referralLink.bonusPercent,
            payoutMode: referralLink.payoutMode ?? ReferralPayoutMode.BALANCE,
          }
        : {
            kind: orderId ? 'legacy_referral' : 'manual_award',
            bonusPercent: settings.bonusPercent,
            payoutMode: ReferralPayoutMode.BALANCE,
          },
    });
  }

  /**
   * Получить статистику реферальной программы для пользователя
   */
  async getReferralStats(userId: string) {
    const settings = await this.systemSettingsService.getReferralSettings();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        referrals: {
          select: {
            id: true,
            username: true,
            firstName: true,
            createdAt: true,
            orders: {
              where: { status: 'COMPLETED' },
              select: {
                totalAmount: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    // Считаем общий заработок с рефералов
    const totalReferralEarnings = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: TransactionType.REFERRAL_BONUS,
        status: TransactionStatus.SUCCEEDED,
      },
      _sum: {
        amount: true,
      },
    });

    return {
      referralCode: user.referralCode,
      referralLink: `https://t.me/${this.configService.get('TELEGRAM_BOT_USERNAME', 'mojo_mobile_bot')}?start=ref_${user.referralCode}`,
      referralsCount: user.referrals.length,
      totalEarnings: totalReferralEarnings._sum.amount || 0,
      referralPercent: settings.bonusPercent,
      enabled: settings.enabled,
      minPayout: settings.minPayout,
      referrals: user.referrals.map((ref) => ({
        id: ref.id,
        name: ref.firstName || ref.username || 'Пользователь',
        joinedAt: ref.createdAt,
        totalOrders: ref.orders.length,
        totalSpent: ref.orders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
      })),
    };
  }

  /**
   * Получить топ рефереров (для админки)
   */
  async getTopReferrers(limit = 10) {
    const referrers = await this.prisma.user.findMany({
      where: {
        referrals: {
          some: {},
        },
      },
      include: {
        _count: {
          select: {
            referrals: true,
          },
        },
      },
      orderBy: {
        referrals: {
          _count: 'desc',
        },
      },
      take: limit,
    });

    return referrers.map((user) => ({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      referralsCount: user._count.referrals,
      bonusBalance: user.bonusBalance,
    }));
  }
}
