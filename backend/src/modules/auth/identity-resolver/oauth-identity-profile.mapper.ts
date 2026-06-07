import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthIdentityProvider } from '@prisma/client';
import { OAuthProfile } from '../oauth.service';
import {
  normalizeEmail,
  normalizeProviderSubject,
} from '../identity/auth-identity-normalizer';
import { AuthIdentityInput } from './auth-identity-resolver.types';

const OAUTH_PROVIDER_MAP: Record<OAuthProfile['provider'], AuthIdentityProvider> = {
  google: AuthIdentityProvider.GOOGLE,
  yandex: AuthIdentityProvider.YANDEX,
  vk: AuthIdentityProvider.VK,
  telegram: AuthIdentityProvider.TELEGRAM,
};

@Injectable()
export class OAuthIdentityProfileMapper {
  map(profile: OAuthProfile): AuthIdentityInput {
    const provider = OAUTH_PROVIDER_MAP[profile.provider];
    const providerSubject = normalizeProviderSubject(provider, String(profile.providerId));
    const telegramId = this.telegramId(provider, providerSubject);

    return {
      provider,
      providerSubject,
      email: normalizeEmail(profile.email) ?? undefined,
      emailVerified: Boolean(profile.email),
      firstName: profile.firstName,
      lastName: profile.lastName,
      username: profile.username,
      telegramId,
    };
  }

  private telegramId(
    provider: AuthIdentityProvider,
    providerSubject: string,
  ): bigint | undefined {
    if (provider !== AuthIdentityProvider.TELEGRAM) return undefined;
    if (!/^\d+$/.test(providerSubject)) {
      throw new UnauthorizedException('Telegram provider subject is invalid');
    }
    return BigInt(providerSubject);
  }
}
