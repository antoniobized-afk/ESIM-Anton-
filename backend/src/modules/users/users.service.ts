import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthIdentityProvider, Prisma } from '@prisma/client';
import { AuthIdentityResolverService } from '../auth/identity-resolver/auth-identity-resolver.service';
import {
  buildUsersOrderBy,
  resolveUserSort,
  type UserSortInput,
} from './users.sorting';

const DEFAULT_USERS_PAGE = 1;
const DEFAULT_USERS_LIMIT = 20;
const MAX_USERS_LIMIT = 100;
const POSTGRES_BIGINT_MAX = 9223372036854775807n;

export interface UsersListQuery extends UserSortInput {
  page?: number;
  limit?: number;
  search?: string;
}

type UserWithLoyaltyLevel = Prisma.UserGetPayload<{
  include: { loyaltyLevel: true };
}>;

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLimit(value: unknown): number {
  return Math.min(
    normalizePositiveInteger(value, DEFAULT_USERS_LIMIT),
    MAX_USERS_LIMIT,
  );
}

function normalizeSearch(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseTelegramIdSearch(value: string): bigint | undefined {
  if (!/^\d+$/.test(value)) return undefined;

  const parsed = BigInt(value);
  return parsed <= POSTGRES_BIGINT_MAX ? parsed : undefined;
}

function buildUsersWhere(searchValue?: string): Prisma.UserWhereInput {
  const search = normalizeSearch(searchValue);
  if (!search) return {};

  const conditions: Prisma.UserWhereInput[] = [
    { id: { startsWith: search } },
    { username: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
    { phone: { contains: search, mode: 'insensitive' } },
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName: { contains: search, mode: 'insensitive' } },
  ];
  const telegramId = parseTelegramIdSearch(search);

  if (telegramId !== undefined) {
    conditions.push({ telegramId });
  }

  return { OR: conditions };
}

function andWhere(
  base: Prisma.UserWhereInput,
  condition: Prisma.UserWhereInput,
): Prisma.UserWhereInput {
  return Object.keys(base).length > 0 ? { AND: [base, condition] } : condition;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private readonly identityResolver: AuthIdentityResolverService,
  ) {}

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
    return this.identityResolver.resolveTelegramBotUser({
      telegramId,
      username: data?.username as string | undefined,
      firstName: data?.firstName as string | undefined,
      lastName: data?.lastName as string | undefined,
      utmSource: data?.utmSource,
      utmMedium: data?.utmMedium,
      utmCampaign: data?.utmCampaign,
    });
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
   * Сохранить email пользователя.
   *
   * - Идемпотентно: если email уже принадлежит этому пользователю — возвращает без записи.
   * - Конфликт: если email занят другим аккаунтом — бросает ConflictException
   *   с понятным сообщением для UI.
   */
  async updateEmail(userId: string, email: string) {
    const normalized = email.trim().toLowerCase();

    const [existingUser, existingEmailIdentity] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email: normalized },
        select: { id: true },
      }),
      this.prisma.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthIdentityProvider.EMAIL,
            providerSubject: normalized,
          },
        },
        select: { userId: true },
      }),
    ]);

    const conflictingOwnerId = [existingUser?.id, existingEmailIdentity?.userId]
      .find((ownerId) => ownerId !== undefined && ownerId !== userId);
    if (conflictingOwnerId) {
      throw new ConflictException(
        'Этот email уже привязан к другому аккаунту. Укажите другой адрес или войдите через этот email.',
      );
    }

    if (existingUser?.id === userId) {
      return this.prisma.user.findUnique({ where: { id: userId } });
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { email: normalized },
      });
    } catch (error) {
      // TOCTOU safety: между findUnique и update другой запрос мог занять email
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Этот email уже привязан к другому аккаунту. Укажите другой адрес или войдите через этот email.',
        );
      }
      throw error;
    }
  }

  private async findAllByLoyaltyLevelSort(
    where: Prisma.UserWhereInput,
    page: number,
    limit: number,
    skip: number,
    order: 'asc' | 'desc',
  ) {
    const withLevelWhere = andWhere(where, { loyaltyLevelId: { not: null } });
    const withoutLevelWhere = andWhere(where, { loyaltyLevelId: null });
    const [total, withLevelTotal] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: withLevelWhere }),
    ]);
    const data: UserWithLoyaltyLevel[] = [];

    if (skip < withLevelTotal) {
      const takeFromRankedUsers = Math.min(limit, withLevelTotal - skip);
      const rankedUsers = await this.prisma.user.findMany({
        where: withLevelWhere,
        skip,
        take: takeFromRankedUsers,
        orderBy: buildUsersOrderBy({ sortBy: 'loyaltyLevel', sortOrder: order }),
        include: {
          loyaltyLevel: true,
        },
      });
      data.push(...rankedUsers);
    }

    if (data.length < limit) {
      const nullUsersSkip = Math.max(0, skip - withLevelTotal);
      const usersWithoutLevel = await this.prisma.user.findMany({
        where: withoutLevelWhere,
        skip: nullUsersSkip,
        take: limit - data.length,
        orderBy: { id: 'asc' },
        include: {
          loyaltyLevel: true,
        },
      });
      data.push(...usersWithoutLevel);
    }

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Получить всех пользователей (для админки)
   */
  async findAll(query?: UsersListQuery) {
    const page = normalizePositiveInteger(query?.page, DEFAULT_USERS_PAGE);
    const limit = normalizeLimit(query?.limit);
    const skip = (page - 1) * limit;
    const where = buildUsersWhere(query?.search);
    const sort = resolveUserSort(query);

    if (sort.field === 'loyaltyLevel') {
      return this.findAllByLoyaltyLevelSort(where, page, limit, skip, sort.order);
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: buildUsersOrderBy(query),
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
