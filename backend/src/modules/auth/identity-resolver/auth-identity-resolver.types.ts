import { AuthIdentityProvider } from '@prisma/client';

export type AuthIdentityInput = {
  provider: AuthIdentityProvider;
  providerSubject: string;
  email?: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  username?: string;
  telegramId?: bigint;
};

export type AuthIdentityLoginUser = {
  id: string;
  isBlocked: boolean;
  telegramId?: bigint | null;
};

export type AuthIdentityLoginResult = {
  user: AuthIdentityLoginUser;
  provider: AuthIdentityProvider;
};

export type TelegramBotIdentityInput = {
  telegramId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};
