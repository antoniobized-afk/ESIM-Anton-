import { ConflictException } from '@nestjs/common';
import { AuthIdentityProvider } from '@prisma/client';
import type { PrismaService } from '@/common/prisma/prisma.service';
import type { AuthIdentityResolverService } from '../auth/identity-resolver/auth-identity-resolver.service';
import { UsersService } from './users.service';
import { buildUsersOrderBy, resolveUserSort } from './users.sorting';

function makeService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    userIdentity: {
      findUnique: jest.fn(),
    },
  };

  return {
    prisma,
    service: new UsersService(
      prisma as unknown as PrismaService,
      {} as AuthIdentityResolverService,
    ),
  };
}

describe('UsersService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updateEmail запрещает email, занятый EMAIL identity другого user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.userIdentity.findUnique.mockResolvedValue({ userId: 'other_user' });

    await expect(service.updateEmail('user_1', 'Owner@Example.com')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerSubject: {
          provider: AuthIdentityProvider.EMAIL,
          providerSubject: 'owner@example.com',
        },
      },
      select: { userId: true },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updateEmail разрешает email, если EMAIL identity принадлежит тому же user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.userIdentity.findUnique.mockResolvedValue({ userId: 'user_1' });
    prisma.user.update.mockResolvedValue({ id: 'user_1', email: 'owner@example.com' });

    const result = await service.updateEmail('user_1', ' Owner@Example.com ');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { email: 'owner@example.com' },
    });
    expect(result).toEqual({ id: 'user_1', email: 'owner@example.com' });
  });

  it('updateEmail остается идемпотентным для существующего users.email этого user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1' })
      .mockResolvedValueOnce({ id: 'user_1', email: 'owner@example.com' });
    prisma.userIdentity.findUnique.mockResolvedValue(null);

    const result = await service.updateEmail('user_1', 'owner@example.com');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'user_1', email: 'owner@example.com' });
  });
});

describe('Users sorting contract', () => {
  it('нормализует whitelist, default orders и invalid sortBy как default behavior', () => {
    expect(resolveUserSort({ sortBy: 'balance', sortOrder: 'asc' })).toEqual({
      field: 'balance',
      order: 'asc',
    });
    expect(resolveUserSort({ sortBy: 'totalSpent', sortOrder: 'sideways' })).toEqual({
      field: 'totalSpent',
      order: 'desc',
    });
    expect(resolveUserSort({ sortBy: 'name', sortOrder: 'asc' })).toEqual({
      field: 'createdAt',
      order: 'desc',
    });
  });

  it('строит stable default order createdAt desc -> id asc', () => {
    expect(buildUsersOrderBy()).toEqual([
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('строит relation order по loyaltyLevel.minSpent с id tie-breaker', () => {
    expect(buildUsersOrderBy({ sortBy: 'loyaltyLevel', sortOrder: 'asc' })).toEqual([
      { loyaltyLevel: { minSpent: 'asc' } },
      { id: 'asc' },
    ]);
  });
});

describe('UsersService.findAll', () => {
  it('нормализует page/limit, ищет по support-friendly полям и сортирует до pagination', async () => {
    const { service, prisma } = makeService();
    const users = [{ id: 'user_1', loyaltyLevel: null }];
    const expectedWhere = {
      OR: [
        { id: { startsWith: '123456' } },
        { username: { contains: '123456', mode: 'insensitive' } },
        { email: { contains: '123456', mode: 'insensitive' } },
        { phone: { contains: '123456', mode: 'insensitive' } },
        { firstName: { contains: '123456', mode: 'insensitive' } },
        { lastName: { contains: '123456', mode: 'insensitive' } },
        { telegramId: 123456n },
      ],
    };
    prisma.user.findMany.mockResolvedValue(users);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.findAll({
      page: -5,
      limit: 500,
      search: ' 123456 ',
      sortBy: 'balance',
      sortOrder: 'asc',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      skip: 0,
      take: 100,
      orderBy: [
        { balance: 'asc' },
        { id: 'asc' },
      ],
      include: {
        loyaltyLevel: true,
      },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(result).toEqual({
      data: users,
      meta: {
        total: 1,
        page: 1,
        limit: 100,
        totalPages: 1,
      },
    });
  });

  it('не делает BigInt lookup для чисел вне PostgreSQL bigint range', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ search: '9223372036854775808' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { id: { startsWith: '9223372036854775808' } },
            { username: { contains: '9223372036854775808', mode: 'insensitive' } },
            { email: { contains: '9223372036854775808', mode: 'insensitive' } },
            { phone: { contains: '9223372036854775808', mode: 'insensitive' } },
            { firstName: { contains: '9223372036854775808', mode: 'insensitive' } },
            { lastName: { contains: '9223372036854775808', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it.each(['asc', 'desc'] as const)(
    'держит users без loyaltyLevel в конце при loyaltyLevel %s',
    async (sortOrder) => {
      const { service, prisma } = makeService();
      const rankedUsers = [
        { id: `ranked_1_${sortOrder}`, loyaltyLevel: { minSpent: '1000' } },
        { id: `ranked_2_${sortOrder}`, loyaltyLevel: { minSpent: '2000' } },
      ];
      const rookieUsers = [{ id: `rookie_${sortOrder}`, loyaltyLevel: null }];
      prisma.user.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2);
      prisma.user.findMany
        .mockResolvedValueOnce(rankedUsers)
        .mockResolvedValueOnce(rookieUsers);

      const result = await service.findAll({
        page: 1,
        limit: 3,
        sortBy: 'loyaltyLevel',
        sortOrder,
      });

      expect(prisma.user.findMany).toHaveBeenNthCalledWith(1, {
        where: { loyaltyLevelId: { not: null } },
        skip: 0,
        take: 2,
        orderBy: [
          { loyaltyLevel: { minSpent: sortOrder } },
          { id: 'asc' },
        ],
        include: {
          loyaltyLevel: true,
        },
      });
      expect(prisma.user.findMany).toHaveBeenNthCalledWith(2, {
        where: { loyaltyLevelId: null },
        skip: 0,
        take: 1,
        orderBy: { id: 'asc' },
        include: {
          loyaltyLevel: true,
        },
      });
      expect(result.data).toEqual([...rankedUsers, ...rookieUsers]);
    },
  );
});
