import { MarketingTouchChannel, Prisma } from '@prisma/client';

export const MARKETING_CAMPAIGN_CODE_LENGTH = 12;
export const MARKETING_CAMPAIGN_CODE_MIN_LENGTH = 8;
export const MARKETING_CAMPAIGN_CODE_MAX_LENGTH = 32;
export const MARKETING_CAMPAIGN_CODE_REGEX = new RegExp(
  `^[A-Za-z0-9_-]{${MARKETING_CAMPAIGN_CODE_MIN_LENGTH},${MARKETING_CAMPAIGN_CODE_MAX_LENGTH}}$`,
);
export const MARKETING_SOURCE_EVENT_KEY_REGEX = /^[A-Za-z0-9:_-]{1,180}$/;

export type MarketingAttributionTransaction = Prisma.TransactionClient;

export type VerifiedTelegramMiniAppLaunch = {
  userId: string;
  telegramId: string;
  startParam?: string;
  sourceEventKey: string;
};

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
