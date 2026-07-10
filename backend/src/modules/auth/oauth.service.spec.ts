import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { OAuthService } from './oauth.service';

const botToken = 'telegram-bot-test-token';

function signedWebAppInitData(
  values: Record<string, string>,
) {
  const params = new URLSearchParams(values);
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

describe('OAuthService Telegram WebApp verification', () => {
  const config = {
    get: jest.fn().mockReturnValue(botToken),
  };
  const service = new OAuthService(config as never);

  beforeEach(() => jest.clearAllMocks());

  it('возвращает ma_ launch только после HMAC и auth_date freshness проверки', () => {
    const initData = signedWebAppInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'query_1',
      start_param: 'ma_Campaign123',
      user: JSON.stringify({ id: 123456789, first_name: 'Mojo', username: 'mojo_user' }),
    });

    expect(service.verifyTelegramWebAppInitData(initData)).toEqual({
      provider: 'telegram',
      providerId: '123456789',
      firstName: 'Mojo',
      username: 'mojo_user',
      telegramWebAppStartParam: 'ma_Campaign123',
      telegramWebAppEventKey: expect.stringMatching(/^telegram-mini-app:[A-Za-z0-9_-]{43}$/),
    });
  });

  it('отклоняет подписанный, но expired initData до передачи start_param дальше', () => {
    // 2 часа — старше нового окна свежести WebApp initData (1 час), но моложе
    // окна Login Widget (24 часа): тест ловит именно регресс окна, а не только
    // очень старый auth_date.
    const initData = signedWebAppInitData({
      auth_date: String(Math.floor(Date.now() / 1000) - 7200),
      start_param: 'ma_Campaign123',
      user: JSON.stringify({ id: 123456789 }),
    });

    expect(() => service.verifyTelegramWebAppInitData(initData)).toThrow(UnauthorizedException);
  });

  it('отклоняет imitation с изменённым start_param', () => {
    const initData = signedWebAppInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      start_param: 'ma_Campaign123',
      user: JSON.stringify({ id: 123456789 }),
    }).replace('ma_Campaign123', 'ma_AnotherCampaign');

    expect(() => service.verifyTelegramWebAppInitData(initData)).toThrow(UnauthorizedException);
  });
});
