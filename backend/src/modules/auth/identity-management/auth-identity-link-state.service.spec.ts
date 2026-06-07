import { InternalServerErrorException } from '@nestjs/common';
import { AuthIdentityLinkStateService } from './auth-identity-link-state.service';

function makeService(values: Record<string, string | undefined>) {
  const configService = {
    get: jest.fn((key: string) => values[key]),
  };

  return new AuthIdentityLinkStateService(configService as any);
}

describe('AuthIdentityLinkStateService', () => {
  it('подписывает и проверяет link-state с настроенным секретом', () => {
    const service = makeService({ IDENTITY_LINK_STATE_SECRET: 'state-secret' });

    const state = service.sign({
      provider: 'google',
      userId: 'user_1',
      returnTo: '/profile',
    });

    expect(service.verify(state)).toEqual(
      expect.objectContaining({
        action: 'link',
        provider: 'google',
        userId: 'user_1',
        returnTo: '/profile',
      }),
    );
  });

  it('нормализует небезопасный returnTo в signed link-state', () => {
    const service = makeService({ IDENTITY_LINK_STATE_SECRET: 'state-secret' });

    const state = service.sign({
      provider: 'google',
      userId: 'user_1',
      returnTo: '/%5Cevil.example/path',
    });

    expect(service.verify(state)).toEqual(
      expect.objectContaining({
        returnTo: '/profile',
      }),
    );
  });

  it('не использует development fallback secret в production', () => {
    const service = makeService({ NODE_ENV: 'production' });

    expect(() =>
      service.sign({
        provider: 'google',
        userId: 'user_1',
        returnTo: '/profile',
      }),
    ).toThrow(InternalServerErrorException);
  });
});
