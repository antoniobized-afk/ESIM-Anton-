import { ConflictException } from '@nestjs/common';
import { AuthIdentityProvider, Prisma } from '@prisma/client';
import type { PrismaService } from '@/common/prisma/prisma.service';
import type { AuthIdentityResolverService } from '../auth/identity-resolver/auth-identity-resolver.service';
import {
  ADMIN_USER_READ_MODEL_INCLUDE,
  type AdminUserReadModelSource,
} from './admin-user-read-model';
import { UsersService } from './users.service';
import { buildUsersOrderBy, resolveUserSort } from './users.sorting';

const TEST_DATE = new Date('2026-01-02T03:04:05.000Z');

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
    order: {
      count: jest.fn(),
      aggregate: jest.fn(),
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

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function makeLoyaltyLevel(
  overrides: Partial<NonNullable<AdminUserReadModelSource['loyaltyLevel']>> = {},
): NonNullable<AdminUserReadModelSource['loyaltyLevel']> {
  return {
    id: 'level_1',
    name: 'Gold',
    minSpent: decimal('1000'),
    cashbackPercent: decimal('5'),
    discount: decimal('3'),
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    ...overrides,
  };
}

function makeAdminUserSource(
  overrides: Partial<AdminUserReadModelSource> = {},
): AdminUserReadModelSource {
  return {
    id: 'user_1',
    telegramId: null,
    username: null,
    firstName: null,
    lastName: null,
    phone: null,
    email: null,
    authProvider: 'telegram',
    providerId: 'legacy-provider-id',
    balance: decimal('0'),
    bonusBalance: decimal('0'),
    referralCode: 'ref_user_1',
    referredById: null,
    referralLinkId: null,
    loyaltyLevelId: null,
    totalSpent: decimal('0'),
    isBlocked: false,
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    utmCampaign: null,
    utmMedium: null,
    utmSource: null,
    loyaltyLevel: null,
    identities: [],
    referredBy: null,
    referralLink: null,
    ...overrides,
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
    const users = [makeAdminUserSource({ id: 'user_1' })];
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
      include: ADMIN_USER_READ_MODEL_INCLUDE,
    });
    expect(prisma.user.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: 'user_1',
          telegramId: null,
          balance: '0',
          identityProviders: [],
          attributionSummary: {
            buckets: [{ kind: 'unknown', label: 'Неизвестно' }],
          },
        }),
      ],
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
        include: ADMIN_USER_READ_MODEL_INCLUDE,
      }),
    );
  });

  it('возвращает identityProviders без providerSubject и metadata', async () => {
    const { service, prisma } = makeService();
    const identityWithRawFields = Object.assign(
      {
        id: 'identity_1',
        provider: AuthIdentityProvider.GOOGLE,
        email: 'owner@example.com',
        emailVerified: true,
        displayName: 'Owner',
        linkedAt: TEST_DATE,
        lastLoginAt: null,
      },
      {
        providerSubject: 'secret-provider-subject',
        metadata: { token: 'secret-token' },
      },
    );
    prisma.user.findMany.mockResolvedValue([
      makeAdminUserSource({
        telegramId: 123456789n,
        identities: [identityWithRawFields],
      }),
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.findAll();

    expect(result.data[0].identityProviders).toEqual([
      {
        id: 'identity_1',
        provider: AuthIdentityProvider.GOOGLE,
        label: 'Google',
        email: 'owner@example.com',
        emailVerified: true,
        displayName: 'Owner',
        linkedAt: TEST_DATE.toISOString(),
        lastLoginAt: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-provider-subject');
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(result.data[0]).not.toHaveProperty('authProvider');
    expect(result.data[0]).not.toHaveProperty('providerId');
  });

  it('отдает referral и UTM buckets вместе без synthetic campaign fields', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValue([
      makeAdminUserSource({
        referredById: 'referrer_1',
        referralLinkId: 'link_1',
        utmSource: 'telegram',
        utmMedium: 'bot',
        utmCampaign: 'summer',
        referredBy: {
          id: 'referrer_1',
          username: 'partner',
          firstName: 'Partner',
          lastName: null,
          email: 'partner@example.com',
        },
        referralLink: {
          id: 'link_1',
          code: 'PARTNER',
          label: 'Partner channel',
        },
      }),
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.findAll();

    expect(result.data[0].attributionSummary.buckets).toEqual([
      {
        kind: 'referral',
        label: 'Реферал',
        referredById: 'referrer_1',
        referralLinkId: 'link_1',
        referralLinkCode: 'PARTNER',
        referralLinkLabel: 'Partner channel',
        referrer: {
          id: 'referrer_1',
          displayName: 'Partner',
          username: 'partner',
          email: 'partner@example.com',
        },
      },
      {
        kind: 'utm',
        label: 'UTM',
        source: 'telegram',
        medium: 'bot',
        campaign: 'summer',
      },
    ]);
    expect(result.data[0].attributionSummary.buckets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'entryChannel' }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('firstTouch');
    expect(JSON.stringify(result)).not.toContain('lastTouch');
  });

  it('findAdminById использует admin-safe include и detail read model', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(
      makeAdminUserSource({
        id: 'user_1',
        email: 'owner@example.com',
        identities: [
          {
            id: 'identity_1',
            provider: AuthIdentityProvider.EMAIL,
            email: 'owner@example.com',
            emailVerified: true,
            displayName: null,
            linkedAt: TEST_DATE,
            lastLoginAt: TEST_DATE,
          },
        ],
      }),
    );

    const result = await service.findAdminById('user_1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      include: ADMIN_USER_READ_MODEL_INCLUDE,
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'user_1',
        email: 'owner@example.com',
        identityProviders: [
          expect.objectContaining({
            provider: AuthIdentityProvider.EMAIL,
            label: 'Email',
          }),
        ],
      }),
    );
  });

  it('getUserStats возвращает user через admin-safe read model', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(
      makeAdminUserSource({
        id: 'user_1',
        referredById: 'referrer_1',
        referralLinkId: 'link_1',
        identities: [
          {
            id: 'identity_1',
            provider: AuthIdentityProvider.TELEGRAM,
            email: null,
            emailVerified: false,
            displayName: 'Mojo User',
            linkedAt: TEST_DATE,
            lastLoginAt: null,
          },
        ],
        referralLink: {
          id: 'link_1',
          code: 'PARTNER',
          label: 'Partner channel',
        },
      }),
    );
    prisma.order.count.mockResolvedValue(2);
    prisma.user.count.mockResolvedValue(1);
    prisma.order.aggregate.mockResolvedValue({
      _sum: { totalAmount: decimal('123.45') },
    });

    const result = await service.getUserStats('user_1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      include: ADMIN_USER_READ_MODEL_INCLUDE,
    });
    expect(result.ordersCount).toBe(2);
    expect(result.referralsCount).toBe(1);
    expect(result.totalSpent.toString()).toBe('123.45');
    expect(result.user).toEqual(
      expect.objectContaining({
        id: 'user_1',
        identityProviders: [
          expect.objectContaining({
            provider: AuthIdentityProvider.TELEGRAM,
            label: 'Telegram',
          }),
        ],
        attributionSummary: {
          buckets: [
            expect.objectContaining({
              kind: 'referral',
              referralLinkCode: 'PARTNER',
            }),
          ],
        },
      }),
    );
    expect(result.user).not.toHaveProperty('authProvider');
    expect(result.user).not.toHaveProperty('providerId');
  });

  it.each(['asc', 'desc'] as const)(
    'держит users без loyaltyLevel в конце при loyaltyLevel %s',
    async (sortOrder) => {
      const { service, prisma } = makeService();
      const rankedUsers = [
        makeAdminUserSource({
          id: `ranked_1_${sortOrder}`,
          loyaltyLevelId: 'level_1',
          loyaltyLevel: makeLoyaltyLevel({ minSpent: decimal('1000') }),
        }),
        makeAdminUserSource({
          id: `ranked_2_${sortOrder}`,
          loyaltyLevelId: 'level_2',
          loyaltyLevel: makeLoyaltyLevel({
            id: 'level_2',
            minSpent: decimal('2000'),
          }),
        }),
      ];
      const rookieUsers = [makeAdminUserSource({ id: `rookie_${sortOrder}` })];
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
        include: ADMIN_USER_READ_MODEL_INCLUDE,
      });
      expect(prisma.user.findMany).toHaveBeenNthCalledWith(2, {
        where: { loyaltyLevelId: null },
        skip: 0,
        take: 1,
        orderBy: { id: 'asc' },
        include: ADMIN_USER_READ_MODEL_INCLUDE,
      });
      expect(result.data.map((user) => user.id)).toEqual([
        `ranked_1_${sortOrder}`,
        `ranked_2_${sortOrder}`,
        `rookie_${sortOrder}`,
      ]);
    },
  );
});
