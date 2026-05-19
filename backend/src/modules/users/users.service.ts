import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Найти или создать пользователя по Telegram ID
   * Поддерживает UTM метки для аналитики
   */
  async findOrCreate(
    telegramId: bigint, 
    data?: Partial<Prisma.UserCreateInput> & {
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    }
  ) {
    let user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        loyaltyLevel: true,
        referredBy: true,
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId,
          username: data?.username as string,
          firstName: data?.firstName as string,
          lastName: data?.lastName as string,
          // UTM метки сохраняются при первой регистрации
          utmSource: data?.utmSource,
          utmMedium: data?.utmMedium,
          utmCampaign: data?.utmCampaign,
        },
        include: {
          loyaltyLevel: true,
          referredBy: true,
        },
      });
    }

    return user;
  }

  /**
   * Получить пользователя по ID
   */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        loyaltyLevel: true,
        referredBy: true,
        referrals: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }

  /**
   * Получить пользователя по Telegram ID
   */
  async findByTelegramId(telegramId: bigint) {
    return this.prisma.user.findUnique({
      where: { telegramId },
      include: {
        loyaltyLevel: true,
      },
    });
  }

  /**
   * Обновить баланс пользователя
   */
  async updateBalance(userId: string, amount: number, type: 'balance' | 'bonusBalance' = 'balance') {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        [type]: {
          increment: amount,
        },
      },
    });
  }

  /**
   * Получить статистику пользователя
   */
  async getUserStats(userId: string) {
    const user = await this.findById(userId);

    const ordersCount = await this.prisma.order.count({
      where: { userId, status: 'COMPLETED' },
    });

    const referralsCount = await this.prisma.user.count({
      where: { referredById: userId },
    });

    const totalSpent = await this.prisma.order.aggregate({
      where: { userId, status: 'COMPLETED' },
      _sum: { totalAmount: true },
    });

    return {
      user,
      ordersCount,
      referralsCount,
      totalSpent: totalSpent._sum.totalAmount || 0,
    };
  }

  /**
   * Сохранить email пользователя
   */
  async updateEmail(userId: string, email: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { email },
    });
  }

  /**
   * Получить всех пользователей (для админки)
   */
  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { id: { startsWith: q } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          loyaltyLevel: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
