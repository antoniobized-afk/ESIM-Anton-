import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

// Telegram WebApp initData живет в URL hash/launch params клиента и не кэшируется —
// окно свежести уже, чем у Login Widget (см. verifyTelegramWidget, 86400с).
const TELEGRAM_WEBAPP_AUTH_DATE_MAX_AGE_SECONDS = 3600;

export interface OAuthProfile {
  providerId: string;
  provider: 'google' | 'yandex' | 'vk' | 'telegram';
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
  phone?: string;
  telegramWebAppStartParam?: string;
  telegramWebAppEventKey?: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(private configService: ConfigService) {}

  // ─── Google ──────────────────────────────────────────────────

  getGoogleRedirectUrl(redirectUri: string): string {
    const clientId = this.configService.get('GOOGLE_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthProfile> {
    const clientId = this.configService.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get('GOOGLE_CLIENT_SECRET');

    // Exchange code for tokens
    const { data: tokens } = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    // Get user profile
    const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    return {
      providerId: profile.sub,
      provider: 'google',
      firstName: profile.given_name,
      lastName: profile.family_name,
      email: profile.email,
    };
  }

  // ─── Yandex ──────────────────────────────────────────────────

  getYandexRedirectUrl(redirectUri: string): string {
    const clientId = this.configService.get('YANDEX_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
    });
    return `https://oauth.yandex.ru/authorize?${params}`;
  }

  async exchangeYandexCode(code: string, redirectUri: string): Promise<OAuthProfile> {
    const clientId = this.configService.get('YANDEX_CLIENT_ID');
    const clientSecret = this.configService.get('YANDEX_CLIENT_SECRET');

    // Exchange code for token
    const { data: tokens } = await axios.post(
      'https://oauth.yandex.ru/token',
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    // Get user profile
    const { data: profile } = await axios.get('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${tokens.access_token}` },
    });

    return {
      providerId: String(profile.id),
      provider: 'yandex',
      firstName: profile.first_name,
      lastName: profile.last_name,
      email: profile.default_email,
      username: profile.login,
    };
  }

  // ─── VK ──────────────────────────────────────────────────────

  getVkRedirectUrl(redirectUri: string): string {
    const clientId = this.configService.get('VK_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      v: '5.199',
    });
    return `https://oauth.vk.com/authorize?${params}`;
  }

  async exchangeVkCode(code: string, redirectUri: string): Promise<OAuthProfile> {
    const clientId = this.configService.get('VK_CLIENT_ID');
    const clientSecret = this.configService.get('VK_CLIENT_SECRET');

    // Exchange code for token
    const { data: tokens } = await axios.get('https://oauth.vk.com/access_token', {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
    });

    if (tokens.error) throw new UnauthorizedException(tokens.error_description);

    // Get user profile
    const { data: profileData } = await axios.get('https://api.vk.com/method/users.get', {
      params: {
        access_token: tokens.access_token,
        user_ids: tokens.user_id,
        fields: 'first_name,last_name,screen_name',
        v: '5.199',
      },
    });

    const user = profileData.response?.[0];
    if (!user) throw new UnauthorizedException('VK user not found');

    return {
      providerId: String(user.id),
      provider: 'vk',
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.screen_name,
      email: tokens.email, // VK returns email in token response if scope includes it
    };
  }

  // ─── Telegram Login Widget ────────────────────────────────────

  verifyTelegramWidget(data: Record<string, string>): OAuthProfile {
    const botToken = this.configService.get('TELEGRAM_BOT_TOKEN') || '';
    const { hash, ...checkData } = data;

    if (!hash) throw new UnauthorizedException('hash required');

    const dataCheckString = Object.keys(checkData)
      .sort()
      .map((k) => `${k}=${checkData[k]}`)
      .join('\n');

    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) {
      throw new UnauthorizedException('Telegram signature invalid');
    }

    const authDate = parseInt(checkData.auth_date);
    if (Date.now() / 1000 - authDate > 86400) {
      throw new UnauthorizedException('Telegram auth data expired');
    }

    return {
      providerId: checkData.id,
      provider: 'telegram',
      firstName: checkData.first_name,
      lastName: checkData.last_name,
      username: checkData.username,
    };
  }

  // ─── Telegram WebApp initData validation ─────────────────────

  verifyTelegramWebAppInitData(initData: string): OAuthProfile {
    const botToken = this.configService.get('TELEGRAM_BOT_TOKEN') || '';
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('hash required in initData');

    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) {
      throw new UnauthorizedException('Telegram WebApp signature invalid');
    }

    const authDate = Number(params.get('auth_date'));
    if (
      !Number.isSafeInteger(authDate) ||
      authDate <= 0 ||
      Date.now() / 1000 - authDate > TELEGRAM_WEBAPP_AUTH_DATE_MAX_AGE_SECONDS
    ) {
      throw new UnauthorizedException('Telegram WebApp auth data expired');
    }

    const userRaw = params.get('user');
    if (!userRaw) throw new UnauthorizedException('user missing in initData');

    const user = this.parseTelegramWebAppUser(userRaw);

    return {
      providerId: user.id,
      provider: 'telegram',
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      telegramWebAppStartParam: params.get('start_param') || undefined,
      telegramWebAppEventKey: `telegram-mini-app:${crypto
        .createHash('sha256')
        .update(hash)
        .digest('base64url')}`,
    };
  }

  private parseTelegramWebAppUser(userRaw: string): {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
  } {
    let value: unknown;
    try {
      value = JSON.parse(userRaw);
    } catch {
      throw new UnauthorizedException('invalid user JSON in initData');
    }

    if (!value || typeof value !== 'object') {
      throw new UnauthorizedException('invalid user JSON in initData');
    }

    const user = value as Record<string, unknown>;
    const rawId = user.id;
    const id = typeof rawId === 'string' || typeof rawId === 'number'
      ? String(rawId)
      : '';
    if (!/^\d+$/.test(id)) {
      throw new UnauthorizedException('Telegram user id is invalid');
    }

    return {
      id,
      firstName: typeof user.first_name === 'string' ? user.first_name : undefined,
      lastName: typeof user.last_name === 'string' ? user.last_name : undefined,
      username: typeof user.username === 'string' ? user.username : undefined,
    };
  }

  // ─── Helpers (token-based, for backward compat) ───────────────

  async verifyGoogle(idToken: string): Promise<OAuthProfile> {
    const { data } = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
    );
    if (!data.sub) throw new UnauthorizedException('Invalid Google token');
    return {
      providerId: data.sub,
      provider: 'google',
      firstName: data.given_name,
      lastName: data.family_name,
      email: data.email,
    };
  }

  async verifyYandex(oauthToken: string): Promise<OAuthProfile> {
    const { data } = await axios.get('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${oauthToken}` },
    });
    if (!data.id) throw new UnauthorizedException('Invalid Yandex token');
    return {
      providerId: String(data.id),
      provider: 'yandex',
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.default_email,
      username: data.login,
    };
  }
}
