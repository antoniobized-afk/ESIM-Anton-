import { AuthIdentityProvider } from '@prisma/client';

export const USER_FACING_IDENTITY_PROVIDERS = [
  AuthIdentityProvider.EMAIL,
  AuthIdentityProvider.TELEGRAM,
  AuthIdentityProvider.GOOGLE,
  AuthIdentityProvider.YANDEX,
] as const;

export type UserFacingIdentityProvider = (typeof USER_FACING_IDENTITY_PROVIDERS)[number];

export const OAUTH_IDENTITY_LINK_PROVIDERS = ['google', 'yandex'] as const;

export type OAuthIdentityLinkProvider = (typeof OAUTH_IDENTITY_LINK_PROVIDERS)[number];

export function isOAuthIdentityLinkProvider(
  provider: string,
): provider is OAuthIdentityLinkProvider {
  return OAUTH_IDENTITY_LINK_PROVIDERS.includes(provider as OAuthIdentityLinkProvider);
}

export type UserIdentityView = {
  id: string;
  provider: AuthIdentityProvider;
  label: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  linkedAt: Date;
  lastLoginAt: Date | null;
  canUnlink: boolean;
};

export type UserIdentitiesResponse = {
  identities: UserIdentityView[];
  availableProviders: UserFacingIdentityProvider[];
};

export type OAuthLinkStatePayload = {
  v: 1;
  action: 'link';
  provider: OAuthIdentityLinkProvider;
  userId: string;
  returnTo: string;
  nonce: string;
  exp: number;
};

export type OAuthLinkCallbackResult = {
  handled: true;
  returnTo: string;
  status: 'linked' | 'already_linked';
};
