import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { normalizeRelativeReturnTo } from '../identity/auth-redirect-normalizer';
import { OAuthLinkStatePayload } from './auth-identity-management.types';

@Injectable()
export class AuthIdentityLinkStateService {
  constructor(private readonly configService: ConfigService) {}

  sign(params: {
    provider: OAuthLinkStatePayload['provider'];
    userId: string;
    returnTo?: string;
  }): string {
    const payload: OAuthLinkStatePayload = {
      v: 1,
      action: 'link',
      provider: params.provider,
      userId: params.userId,
      returnTo: this.safeReturnTo(params.returnTo),
      nonce: randomBytes(16).toString('hex'),
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    };
    const encoded = this.base64UrlEncode(JSON.stringify(payload));
    return `${encoded}.${this.signature(encoded)}`;
  }

  verify(state?: string | null): OAuthLinkStatePayload | null {
    if (!state || !state.includes('.')) return null;

    const [encoded, signature] = state.split('.', 2);
    if (!encoded || !signature || !this.isValidSignature(encoded, signature)) return null;

    try {
      const payload = JSON.parse(this.base64UrlDecode(encoded)) as OAuthLinkStatePayload;
      if (payload.v !== 1 || payload.action !== 'link') return null;
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
      if (!['google', 'yandex'].includes(payload.provider)) return null;
      return { ...payload, returnTo: this.safeReturnTo(payload.returnTo) };
    } catch {
      return null;
    }
  }

  isLinkStateShape(state?: string | null): boolean {
    if (!state || !state.includes('.')) return false;
    const [encoded] = state.split('.', 1);
    try {
      const payload = JSON.parse(this.base64UrlDecode(encoded));
      return payload?.v === 1 && payload?.action === 'link';
    } catch {
      return false;
    }
  }

  private signature(encodedPayload: string): string {
    return createHmac('sha256', this.secret()).update(encodedPayload).digest('base64url');
  }

  private isValidSignature(encodedPayload: string, signature: string): boolean {
    const expected = Buffer.from(this.signature(encodedPayload));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private secret(): string {
    const configuredSecret =
      this.configService.get<string>('IDENTITY_LINK_STATE_SECRET') ||
      this.configService.get<string>('JWT_SECRET');
    if (configuredSecret) return configuredSecret;

    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new InternalServerErrorException(
        'Identity link state secret is not configured',
      );
    }

    return 'development-identity-link-state-secret';
  }

  private safeReturnTo(returnTo?: string | null): string {
    return normalizeRelativeReturnTo(returnTo, '/profile');
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private base64UrlDecode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
}
