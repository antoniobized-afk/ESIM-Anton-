import { AuthIdentityProvider } from '@prisma/client';

export const LEGACY_PROVIDER_MAP: Record<string, AuthIdentityProvider> = {
  email: AuthIdentityProvider.EMAIL,
  telegram: AuthIdentityProvider.TELEGRAM,
  google: AuthIdentityProvider.GOOGLE,
  yandex: AuthIdentityProvider.YANDEX,
  vk: AuthIdentityProvider.VK,
};

export const AUTH_IDENTITY_PROVIDERS = [
  AuthIdentityProvider.EMAIL,
  AuthIdentityProvider.TELEGRAM,
  AuthIdentityProvider.GOOGLE,
  AuthIdentityProvider.YANDEX,
  AuthIdentityProvider.VK,
] as const;

export function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function normalizeProviderSubject(
  provider: AuthIdentityProvider,
  providerSubject: string,
): string {
  const trimmed = providerSubject.trim();
  return provider === AuthIdentityProvider.EMAIL ? trimmed.toLowerCase() : trimmed;
}

export function identityKey(provider: AuthIdentityProvider, providerSubject: string): string {
  return `${provider}:${providerSubject}`;
}

export function providerToLegacyValue(provider: AuthIdentityProvider): string {
  return provider.toLowerCase();
}
