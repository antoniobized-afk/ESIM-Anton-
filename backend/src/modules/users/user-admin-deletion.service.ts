import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

const USER_DELETE_SELECT = {
  id: true,
  balance: true,
  bonusBalance: true,
  totalSpent: true,
  referredById: true,
  referralLinkId: true,
  _count: {
    select: {
      orders: true,
      repeatChargeAttempts: true,
      transactions: true,
      cloudPaymentsCardTokens: true,
      referralLinks: true,
      referrals: true,
      ownedPromoCodes: true,
      promoCodeRedemptions: true,
      promoRewardSnapshots: true,
    },
  },
} satisfies Prisma.UserSelect;

type UserDeleteCandidate = Prisma.UserGetPayload<{ select: typeof USER_DELETE_SELECT }>;

type DeleteBlocker = {
  code: string;
  message: string;
};

type DeleteResult = {
  success: true;
  deletedUserId: string;
  deletedIdentityCount: number;
  deletedIdentityAuditCount: number;
  deletedPushSubscriptionCount: number;
  deletedNotificationCount: number;
};

type CountKey = keyof UserDeleteCandidate['_count'];

const COUNT_BLOCKERS: Array<[CountKey, string, string]> = [
  ['orders', 'ORDERS_PRESENT', 'Есть заказы.'],
  ['repeatChargeAttempts', 'REPEAT_CHARGE_ATTEMPTS_PRESENT', 'Есть попытки повторных списаний.'],
  ['transactions', 'TRANSACTIONS_PRESENT', 'Есть транзакции.'],
  ['cloudPaymentsCardTokens', 'SAVED_CARDS_PRESENT', 'Есть сохраненные карты CloudPayments.'],
  ['referralLinks', 'REFERRAL_LINKS_PRESENT', 'Пользователь владеет реферальными ссылками.'],
  ['referrals', 'REFERRED_USERS_PRESENT', 'У пользователя есть привлеченные пользователи.'],
  ['ownedPromoCodes', 'OWNED_PROMO_CODES_PRESENT', 'Пользователь владеет партнерскими промокодами.'],
  ['promoCodeRedemptions', 'PROMO_REDEMPTIONS_PRESENT', 'Есть применения промокодов.'],
  ['promoRewardSnapshots', 'PROMO_REWARD_SNAPSHOTS_PRESENT', 'Есть reward snapshots промокодов.'],
];

@Injectable()
export class UserAdminDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  async deleteUser(userId: string): Promise<DeleteResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: USER_DELETE_SELECT,
      });
      if (!user) throw new NotFoundException('Пользователь не найден');

      const blockers = this.getBlockers(user);
      if (blockers.length > 0) {
        throw new ConflictException({
          code: 'USER_DELETE_BLOCKED',
          message: 'Пользователь не пустой. Удаление заблокировано.',
          blockers,
        });
      }

      const identities = await tx.userIdentity.findMany({
        where: { userId },
        select: { id: true },
      });
      const identityIds = identities.map((identity) => identity.id);
      const auditWhere: Prisma.UserIdentityAuditWhereInput[] = [{ userId }];
      if (identityIds.length > 0) {
        auditWhere.push({ identityId: { in: identityIds } });
      }

      const deletedIdentityAudits = await tx.userIdentityAudit.deleteMany({
        where: { OR: auditWhere },
      });
      const deletedIdentities = await tx.userIdentity.deleteMany({ where: { userId } });
      const deletedPushSubscriptions = await tx.pushSubscription.deleteMany({ where: { userId } });
      const deletedNotifications = await tx.notification.deleteMany({ where: { userId } });

      await tx.user.delete({ where: { id: userId } });

      return {
        success: true,
        deletedUserId: userId,
        deletedIdentityCount: deletedIdentities.count,
        deletedIdentityAuditCount: deletedIdentityAudits.count,
        deletedPushSubscriptionCount: deletedPushSubscriptions.count,
        deletedNotificationCount: deletedNotifications.count,
      };
    });
  }

  private getBlockers(user: UserDeleteCandidate): DeleteBlocker[] {
    const blockers: DeleteBlocker[] = [];

    if (Number(user.balance) > 0) {
      blockers.push({ code: 'BALANCE_PRESENT', message: 'У пользователя есть основной баланс.' });
    }
    if (Number(user.bonusBalance) > 0) {
      blockers.push({ code: 'BONUS_BALANCE_PRESENT', message: 'У пользователя есть бонусный баланс.' });
    }
    if (Number(user.totalSpent) > 0) {
      blockers.push({ code: 'TOTAL_SPENT_PRESENT', message: 'У пользователя есть история покупок.' });
    }
    if (user.referredById || user.referralLinkId) {
      blockers.push({ code: 'REFERRAL_ATTRIBUTION_PRESENT', message: 'Есть реферальная атрибуция.' });
    }

    for (const [key, code, message] of COUNT_BLOCKERS) {
      if (user._count[key] > 0) blockers.push({ code, message });
    }

    return blockers;
  }
}
