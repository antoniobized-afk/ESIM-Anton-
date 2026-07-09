import { AuthIdentityProvider } from '@prisma/client';

const AUTH_IDENTITY_PROVIDER_LABELS: Record<AuthIdentityProvider, string> = {
  [AuthIdentityProvider.EMAIL]: 'Email',
  [AuthIdentityProvider.TELEGRAM]: 'Telegram',
  [AuthIdentityProvider.GOOGLE]: 'Google',
  [AuthIdentityProvider.YANDEX]: 'Яндекс',
  [AuthIdentityProvider.VK]: 'VK',
};

export function getAuthIdentityProviderLabel(
  provider: AuthIdentityProvider,
): string {
  return AUTH_IDENTITY_PROVIDER_LABELS[provider];
}
