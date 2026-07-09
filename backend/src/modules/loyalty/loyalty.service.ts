import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { LoyaltyLevel, Prisma } from '@prisma/client';

type LoyaltyLevelDto = {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discount: number;
};

type ResolvedLoyaltyProgram = {
  currentLevel: LoyaltyLevelDto | null;
  nextLevel: LoyaltyLevelDto | null;
  amountToNextLevel: number;
  progressToNextLevel: number;
};

export type LoyaltyPrismaClient = Pick<PrismaService, 'user' | 'loyaltyLevel'>;

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  private toLevelDto(level: {
    id: string;
    name: string;
    minSpent: Prisma.Decimal | number;
    cashbackPercent: Prisma.Decimal | number;
    discount: Prisma.Decimal | number;
  }): LoyaltyLevelDto {
    return {
      id: level.id,
      name: level.name,
      minSpent: Number(level.minSpent),
      cashbackPercent: Number(level.cashbackPercent),
      discount: Number(level.discount),
    };
  }

  private normalizeName(name: string) {
    return name.trim();
  }

  private async getOrderedLevels(client: LoyaltyPrismaClient = this.prisma) {
    const levels = await client.loyaltyLevel.findMany({
      orderBy: [
        { minSpent: 'asc' },
        { id: 'asc' },
      ],
    });

    return levels.map((level) => this.toLevelDto(level));
  }

  private resolveLevelBySpent(levels: LoyaltyLevelDto[], totalSpent: number): ResolvedLoyaltyProgram {
    const currentLevel =
      [...levels].reverse().find((level) => level.minSpent <= totalSpent) ?? null;
    const nextLevel = levels.find((level) => level.minSpent > totalSpent) ?? null;
    const currentLevelSpent = currentLevel?.minSpent ?? 0;
    const nextLevelSpent = nextLevel?.minSpent ?? currentLevelSpent;
    const amountToNextLevel = nextLevel
      ? Math.max(0, nextLevelSpent - totalSpent)
      : 0;
    const progressToNextLevel = nextLevel
      ? Math.max(
          0,
          Math.min(
            100,
            ((totalSpent - currentLevelSpent) /
              Math.max(1, nextLevelSpent - currentLevelSpent)) *
              100,
          ),
        )
      : 100;

    return {
      currentLevel,
      nextLevel,
      amountToNextLevel,
      progressToNextLevel: Math.round(progressToNextLevel * 100) / 100,
    };
  }

  private async validateLevelInput(
    client: LoyaltyPrismaClient,
    data: {
      name: string;
      minSpent: number;
      cashbackPercent: number;
      discount: number;
    },
    excludeId?: string,
  ) {
    const normalizedName = this.normalizeName(data.name);

    const [nameCollision, minSpentCollision] = await Promise.all([
      client.loyaltyLevel.findFirst({
        where: {
          name: normalizedName,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      }),
      client.loyaltyLevel.findFirst({
        where: {
          minSpent: new Prisma.Decimal(data.minSpent),
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      }),
    ]);

    if (nameCollision) {
      throw new BadRequestException('Уровень с таким названием уже существует');
    }

    if (minSpentCollision) {
      throw new BadRequestException('Уровень с таким порогом трат уже существует');
    }

    return normalizedName;
  }

  private async recalculateAllUserLevelsTx(client: LoyaltyPrismaClient) {
    const [levels, users] = await Promise.all([
      this.getOrderedLevels(client),
      client.user.findMany({
        select: {
          id: true,
          totalSpent: true,
          loyaltyLevelId: true,
        },
      }),
    ]);

    for (const user of users) {
      const resolved = this.resolveLevelBySpent(levels, Number(user.totalSpent));
      const nextLevelId = resolved.currentLevel?.id ?? null;

      if (nextLevelId === user.loyaltyLevelId) {
        continue;
      }

      await client.user.update({
        where: { id: user.id },
        data: { loyaltyLevelId: nextLevelId },
      });
    }
  }

  private async updateUserLevelTx(userId: string, client: LoyaltyPrismaClient) {
    const [user, levels] = await Promise.all([
      client.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          totalSpent: true,
          loyaltyLevelId: true,
        },
      }),
      this.getOrderedLevels(client),
    ]);

    if (!user) return null;

    const resolved = this.resolveLevelBySpent(levels, Number(user.totalSpent));
    const nextLevelId = resolved.currentLevel?.id ?? null;

    if (nextLevelId !== user.loyaltyLevelId) {
      return client.user.update({
        where: { id: userId },
        data: {
          loyaltyLevelId: nextLevelId,
        },
        include: {
          loyaltyLevel: true,
        },
      });
    }

    return client.user.findUnique({
      where: { id: userId },
      include: {
        loyaltyLevel: true,
      },
    });
  }

  /**
   * Получить все уровни лояльности
   */
  async getLevels() {
    return this.getOrderedLevels();
  }

  /**
   * Получить уровень по ID
   */
  async getLevelById(id: string) {
    const level = await this.prisma.loyaltyLevel.findUnique({
      where: { id },
    });

    if (!level) {
      throw new NotFoundException('Уровень лояльности не найден');
    }

    return this.toLevelDto(level);
  }

  async getEffectiveLevelForSpent(totalSpent: number) {
    const levels = await this.getOrderedLevels();
    return this.resolveLevelBySpent(levels, totalSpent).currentLevel;
  }

  /**
   * Создать уровень лояльности
   */
  async createLevel(data: Prisma.LoyaltyLevelCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      const normalizedName = await this.validateLevelInput(tx as LoyaltyPrismaClient, {
        name: String(data.name),
        minSpent: Number(data.minSpent),
        cashbackPercent: Number(data.cashbackPercent),
        discount: Number(data.discount),
      });

      const created = await tx.loyaltyLevel.create({
        data: {
          ...data,
          name: normalizedName,
        },
      });

      await this.recalculateAllUserLevelsTx(tx as LoyaltyPrismaClient);

      return this.toLevelDto(created);
    });
  }

  /**
   * Обновить уровень лояльности
   */
  async updateLevel(id: string, data: Prisma.LoyaltyLevelUpdateInput) {
    const existing = await this.prisma.loyaltyLevel.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Уровень лояльности не найден');
    }

    return this.prisma.$transaction(async (tx) => {
      const normalizedName = await this.validateLevelInput(tx as LoyaltyPrismaClient, {
        name: String(data.name ?? existing.name),
        minSpent: Number(data.minSpent ?? existing.minSpent),
        cashbackPercent: Number(data.cashbackPercent ?? existing.cashbackPercent),
        discount: Number(data.discount ?? existing.discount),
      }, id);

      const updated = await tx.loyaltyLevel.update({
        where: { id },
        data: {
          ...data,
          name: normalizedName,
        },
      });

      await this.recalculateAllUserLevelsTx(tx as LoyaltyPrismaClient);

      return this.toLevelDto(updated);
    });
  }

  /**
   * Удалить уровень лояльности
   */
  async deleteLevel(id: string) {
    const existing = await this.prisma.loyaltyLevel.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Уровень лояльности не найден');
    }

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.loyaltyLevel.delete({
        where: { id },
      });

      await this.recalculateAllUserLevelsTx(tx as LoyaltyPrismaClient);

      return this.toLevelDto(deleted);
    });
  }

  /**
   * Обновить уровень пользователя на основе его трат
   */
  async updateUserLevel(
    userId: string,
    client: LoyaltyPrismaClient = this.prisma,
  ) {
    return this.updateUserLevelTx(userId, client);
  }

  async recalculateAllUserLevels() {
    await this.recalculateAllUserLevelsTx(this.prisma);
    return { success: true };
  }

  async getUserProgram(userId: string) {
    const [user, levels] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          totalSpent: true,
          bonusBalance: true,
          loyaltyLevel: true,
        },
      }),
      this.getOrderedLevels(),
    ]);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const totalSpent = Number(user.totalSpent);
    const bonusBalance = Number(user.bonusBalance);
    const resolved = this.resolveLevelBySpent(levels, totalSpent);

    return {
      totalSpent,
      bonusBalance,
      currentLevel: resolved.currentLevel,
      nextLevel: resolved.nextLevel,
      amountToNextLevel: resolved.amountToNextLevel,
      progressToNextLevel: resolved.progressToNextLevel,
      levels,
      currentDiscount: resolved.currentLevel?.discount ?? 0,
      currentCashbackPercent: resolved.currentLevel?.cashbackPercent ?? 0,
      effectiveLevelId: resolved.currentLevel?.id ?? user.loyaltyLevel?.id ?? null,
    };
  }

  /**
   * Получить пользователей по уровню
   */
  async getUsersByLevel(levelId: string) {
    return this.prisma.user.findMany({
      where: { loyaltyLevelId: levelId },
      select: {
        id: true,
        username: true,
        firstName: true,
        totalSpent: true,
        bonusBalance: true,
      },
    });
  }
}
