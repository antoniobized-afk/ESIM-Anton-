import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { MergeAssetCounts } from './user-merge-preflight.types';

@Injectable()
export class UserMergePreflightAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async load(sourceUserId: string, targetUserId: string): Promise<MergeAssetCounts> {
    const where = { in: [sourceUserId, targetUserId] };
    const [
      orders,
      transactions,
      savedCards,
      referralLinks,
      ownedPromoCodes,
      promoRedemptions,
      rewardSnapshots,
      pushSubscriptions,
      notifications,
    ] = await Promise.all([
      this.countByUser('order', 'userId', where),
      this.countByUser('transaction', 'userId', where),
      this.countByUser('cloudPaymentsCardToken', 'userId', where),
      this.countByUser('referralLink', 'userId', where),
      this.countByUser('promoCode', 'referralOwnerId', where),
      this.countByUser('promoCodeRedemption', 'userId', where),
      this.countByUser('promoCodeRedemption', 'rewardOwnerIdSnapshot', where),
      this.countByUser('pushSubscription', 'userId', where),
      this.countByUser('notification', 'userId', where),
    ]);

    return {
      orders,
      transactions,
      savedCards,
      referralLinks,
      ownedPromoCodes,
      promoRedemptions,
      rewardSnapshots,
      pushSubscriptions,
      notifications,
    };
  }

  private async countByUser(
    model: string,
    field: string,
    value: { in: string[] },
  ): Promise<Record<string, number>> {
    const delegate = (this.prisma as any)[model];
    const rows = await Promise.all(
      value.in.map(async (userId) => ({
        userId,
        count: await delegate.count({ where: { [field]: userId } }),
      })),
    );
    return Object.fromEntries(rows.map((row) => [row.userId, row.count]));
  }
}
