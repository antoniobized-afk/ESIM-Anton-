import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthIdentityProvider, Prisma } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

export type ReferralRegistrationClient = Pick<
  Prisma.TransactionClient,
  'user' | 'userIdentity' | 'order' | 'referralLink'
>;

export type TelegramIdentityAssertion = {
  userId: string;
  telegramId: bigint;
  contactTelegramId?: bigint | null;
};

type ReferralRegistrationUser = {
  referredById: string | null;
  referralLinkId: string | null;
  telegramId: bigint | null;
};

type PartnerReferralLink = {
  id: string;
  userId: string;
  isActive: boolean;
  expiresAt: Date | null;
  user: { id: string; referralCode: string | null };
};

export function isReferralLinkActive(link: { isActive: boolean; expiresAt: Date | null }) {
  return link.isActive && (!link.expiresAt || link.expiresAt > new Date());
}

@Injectable()
export class ReferralRegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async registerReferral(
    userId: string,
    referralCode: string,
    expectedTelegramId?: bigint,
    client: ReferralRegistrationClient = this.prisma,
  ) {
    const normalizedPartnerCode = referralCode.trim().toUpperCase();
    const normalizedLegacyUserCode = referralCode.trim();
    const currentUser = await this.findRegistrationUser(client, userId);
    if (!currentUser) return null;

    if (expectedTelegramId !== undefined) {
      await this.assertCanonicalTelegramUser(client, {
        userId,
        telegramId: expectedTelegramId,
        contactTelegramId: currentUser.telegramId,
      });
    }
    if (currentUser.referredById && !currentUser.referralLinkId) return null;
    if (await this.hasCompletedPrimaryOrder(client, userId)) return null;

    const partnerLink = await client.referralLink.findUnique({
      where: { code: normalizedPartnerCode },
      include: { user: { select: { id: true, referralCode: true } } },
    });
    if (partnerLink) {
      return this.applyPartnerReferralLink(client, userId, currentUser, partnerLink, true);
    }
    if (currentUser.referredById) return null;

    const referrer = await client.user.findUnique({
      where: { referralCode: normalizedLegacyUserCode },
      select: { id: true, referralCode: true },
    });
    if (!referrer || referrer.id === userId) return null;

    const result = await client.user.updateMany({
      where: {
        id: userId,
        referredById: null,
        ...this.noCompletedPrimaryOrderWhere(),
      },
      data: { referredById: referrer.id, referralLinkId: null },
    });

    return result.count === 1 ? referrer : null;
  }

  async registerReferralLink(
    userId: string,
    referralLinkId: string,
    client: ReferralRegistrationClient = this.prisma,
  ) {
    const currentUser = await this.findRegistrationUser(client, userId);
    if (!currentUser || (currentUser.referredById && !currentUser.referralLinkId)) {
      return null;
    }

    const partnerLink = await client.referralLink.findUnique({
      where: { id: referralLinkId },
      include: { user: { select: { id: true, referralCode: true } } },
    });
    if (!partnerLink) return null;

    return this.applyPartnerReferralLink(client, userId, currentUser, partnerLink);
  }

  async assertCanonicalTelegramUser(
    client: ReferralRegistrationClient,
    input: TelegramIdentityAssertion,
  ) {
    const userPromise = input.contactTelegramId === undefined
      ? client.user.findUnique({
          where: { id: input.userId },
          select: { telegramId: true },
        })
      : Promise.resolve({ telegramId: input.contactTelegramId });
    const [user, identity] = await Promise.all([
      userPromise,
      client.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: AuthIdentityProvider.TELEGRAM,
            providerSubject: input.telegramId.toString(),
          },
        },
        select: { userId: true },
      }),
    ]);

    if (
      !user ||
      identity?.userId !== input.userId ||
      (user.telegramId !== null && user.telegramId !== input.telegramId)
    ) {
      throw new ForbiddenException('Telegram identity не принадлежит указанному пользователю');
    }
  }

  private findRegistrationUser(client: ReferralRegistrationClient, userId: string) {
    return client.user.findUnique({
      where: { id: userId },
      select: { referredById: true, referralLinkId: true, telegramId: true },
    }) as Promise<ReferralRegistrationUser | null>;
  }

  private async applyPartnerReferralLink(
    client: ReferralRegistrationClient,
    userId: string,
    currentUser: ReferralRegistrationUser,
    partnerLink: PartnerReferralLink,
    completedPrimaryOrderChecked = false,
  ) {
    if (!isReferralLinkActive(partnerLink) || partnerLink.userId === userId) {
      return null;
    }
    if (!completedPrimaryOrderChecked && await this.hasCompletedPrimaryOrder(client, userId)) {
      return null;
    }
    if (
      currentUser.referredById === partnerLink.userId &&
      currentUser.referralLinkId === partnerLink.id
    ) {
      return partnerLink.user;
    }

    const result = await client.user.updateMany({
      where: {
        id: userId,
        OR: [
          { referredById: null },
          { referralLinkId: { not: null } },
        ],
        ...this.noCompletedPrimaryOrderWhere(),
      },
      data: { referredById: partnerLink.userId, referralLinkId: partnerLink.id },
    });

    return result.count === 1 ? partnerLink.user : null;
  }

  private async hasCompletedPrimaryOrder(client: ReferralRegistrationClient, userId: string) {
    const order = await client.order.findFirst({
      where: { userId, status: 'COMPLETED', parentOrderId: null },
      select: { id: true },
    });
    return order !== null;
  }

  private noCompletedPrimaryOrderWhere(): Prisma.UserWhereInput {
    return {
      orders: { none: { status: 'COMPLETED', parentOrderId: null } },
    };
  }
}
