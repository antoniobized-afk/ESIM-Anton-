import { MarketingTouchChannel, Prisma } from '@prisma/client';

export type MarketingAttributionTransaction = Prisma.TransactionClient;

export type MarketingCampaignActor = {
  id: string;
  role?: string | null;
};

type TrustedMarketingTouchBaseInput = {
  campaignCode: string;
  channel: MarketingTouchChannel;
  sourceEventKey: string;
  occurredAt?: Date;
};

export type TrustedMarketingTouchInput = TrustedMarketingTouchBaseInput &
  (
    | { userId: string; visitorKeyHash?: never }
    | { userId?: never; visitorKeyHash: string }
  );
