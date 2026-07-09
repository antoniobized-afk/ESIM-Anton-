import { BadRequestException } from '@nestjs/common';
import { LoyaltyService, type LoyaltyPrismaClient } from './loyalty.service';

describe('LoyaltyService', () => {
  const prisma = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    loyaltyLevel: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const service = new LoyaltyService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('getUserProgram возвращает текущий уровень, следующий порог и прогресс', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      totalSpent: 12000,
      bonusBalance: 350,
      loyaltyLevel: {
        id: 'silver',
      },
    });
    prisma.loyaltyLevel.findMany.mockResolvedValue([
      { id: 'starter', name: 'Старт', minSpent: 0, cashbackPercent: 1, discount: 0 },
      { id: 'silver', name: 'Серебро', minSpent: 10000, cashbackPercent: 5, discount: 3 },
      { id: 'gold', name: 'Золото', minSpent: 20000, cashbackPercent: 7, discount: 5 },
    ]);

    const result = await service.getUserProgram('user_1');

    expect(result).toMatchObject({
      totalSpent: 12000,
      bonusBalance: 350,
      currentLevel: {
        id: 'silver',
        cashbackPercent: 5,
        discount: 3,
      },
      nextLevel: {
        id: 'gold',
        minSpent: 20000,
      },
      amountToNextLevel: 8000,
      currentCashbackPercent: 5,
      currentDiscount: 3,
      effectiveLevelId: 'silver',
    });
    expect(result.progressToNextLevel).toBeGreaterThan(0);
    expect(result.progressToNextLevel).toBeLessThan(100);
  });

  it('getUserProgram показывает 100% прогресс на максимальном уровне', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_2',
      totalSpent: 150000,
      bonusBalance: 999,
      loyaltyLevel: null,
    });
    prisma.loyaltyLevel.findMany.mockResolvedValue([
      { id: 'starter', name: 'Старт', minSpent: 0, cashbackPercent: 1, discount: 0 },
      { id: 'platinum', name: 'Платина', minSpent: 100000, cashbackPercent: 10, discount: 15 },
    ]);

    const result = await service.getUserProgram('user_2');

    expect(result.currentLevel?.id).toBe('platinum');
    expect(result.nextLevel).toBeNull();
    expect(result.amountToNextLevel).toBe(0);
    expect(result.progressToNextLevel).toBe(100);
  });

  it('getUserProgram корректно работает при отсутствии уровней', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_3',
      totalSpent: 500,
      bonusBalance: 25,
      loyaltyLevel: null,
    });
    prisma.loyaltyLevel.findMany.mockResolvedValue([]);

    const result = await service.getUserProgram('user_3');

    expect(result.currentLevel).toBeNull();
    expect(result.nextLevel).toBeNull();
    expect(result.amountToNextLevel).toBe(0);
    expect(result.progressToNextLevel).toBe(100);
    expect(result.currentDiscount).toBe(0);
    expect(result.currentCashbackPercent).toBe(0);
  });

  it('updateUserLevel назначает dynamic level по totalSpent', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_4',
      totalSpent: 16000,
      loyaltyLevelId: 'starter',
    });
    prisma.loyaltyLevel.findMany.mockResolvedValue([
      { id: 'starter', name: 'Старт', minSpent: 0, cashbackPercent: 1, discount: 0 },
      { id: 'silver', name: 'Серебро', minSpent: 15000, cashbackPercent: 5, discount: 3 },
    ]);
    prisma.user.update.mockResolvedValue({
      id: 'user_4',
      loyaltyLevelId: 'silver',
    });

    await service.updateUserLevel('user_4');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_4' },
      data: { loyaltyLevelId: 'silver' },
      include: { loyaltyLevel: true },
    });
  });

  it('updateUserLevel использует переданный transaction client', async () => {
    const txClient = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user_tx',
          totalSpent: 5100,
          loyaltyLevelId: null,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'user_tx',
          loyaltyLevelId: 'bronze',
        }),
      },
      loyaltyLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'starter', name: 'Старт', minSpent: 0, cashbackPercent: 1, discount: 0 },
          { id: 'bronze', name: 'Бронза', minSpent: 5000, cashbackPercent: 3, discount: 2 },
        ]),
      },
    } as unknown as LoyaltyPrismaClient;

    await service.updateUserLevel('user_tx', txClient);

    expect(txClient.user.update).toHaveBeenCalledWith({
      where: { id: 'user_tx' },
      data: { loyaltyLevelId: 'bronze' },
      include: { loyaltyLevel: true },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.loyaltyLevel.findMany).not.toHaveBeenCalled();
  });

  it('updateUserLevel не делает лишний update при совпадении', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_5',
      totalSpent: 20000,
      loyaltyLevelId: 'gold',
    });
    prisma.loyaltyLevel.findMany.mockResolvedValue([
      { id: 'starter', name: 'Старт', minSpent: 0, cashbackPercent: 1, discount: 0 },
      { id: 'gold', name: 'Золото', minSpent: 20000, cashbackPercent: 7, discount: 5 },
    ]);
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user_5',
      totalSpent: 20000,
      loyaltyLevelId: 'gold',
    }).mockResolvedValueOnce({
      id: 'user_5',
      loyaltyLevel: { id: 'gold' },
    });

    await service.updateUserLevel('user_5');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('recalculateAllUserLevels после delete reassigned пользователей на подходящий уровень', async () => {
    prisma.loyaltyLevel.findUnique.mockResolvedValue({
      id: 'silver',
      name: 'Серебро',
      minSpent: 10000,
      cashbackPercent: 5,
      discount: 3,
    });
    prisma.loyaltyLevel.delete.mockResolvedValue({
      id: 'silver',
      name: 'Серебро',
      minSpent: 10000,
      cashbackPercent: 5,
      discount: 3,
    });
    prisma.loyaltyLevel.findMany.mockResolvedValue([
      { id: 'starter', name: 'Старт', minSpent: 0, cashbackPercent: 1, discount: 0 },
      { id: 'gold', name: 'Золото', minSpent: 20000, cashbackPercent: 7, discount: 5 },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'user_1', totalSpent: 12000, loyaltyLevelId: 'silver' },
      { id: 'user_2', totalSpent: 25000, loyaltyLevelId: 'silver' },
    ]);

    await service.deleteLevel('silver');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { loyaltyLevelId: 'starter' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_2' },
      data: { loyaltyLevelId: 'gold' },
    });
  });

  it('createLevel отклоняет дублирующийся minSpent', async () => {
    prisma.loyaltyLevel.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });

    await expect(
      service.createLevel({
        name: 'Новый',
        minSpent: 5000,
        cashbackPercent: 3,
        discount: 2,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
