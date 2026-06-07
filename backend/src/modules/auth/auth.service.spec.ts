import { AuthIdentityProvider } from '@prisma/client';
import { AuthService } from './auth.service';

function makeService() {
  const prisma = {
    admin: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  const jwtService = {
    sign: jest.fn().mockReturnValue('jwt_token'),
    verify: jest.fn(),
  };
  const identityResolver = {
    resolveEmailLogin: jest.fn(),
    resolveOAuthLogin: jest.fn(),
  };

  return {
    service: new AuthService(prisma as any, jwtService as any, identityResolver as any),
    prisma,
    jwtService,
    identityResolver,
  };
}

describe('AuthService identity ownership boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loginWithOAuth выпускает JWT на canonical user.id, а не identity id/provider subject', async () => {
    const { service, jwtService, identityResolver } = makeService();
    identityResolver.resolveOAuthLogin.mockResolvedValue({
      user: { id: 'user_1', authProvider: 'google', isBlocked: false },
      provider: AuthIdentityProvider.GOOGLE,
    });

    const result = await service.loginWithOAuth({
      provider: 'google',
      providerId: 'google_subject_1',
      email: 'user@example.com',
    });

    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'user_1', type: 'user', provider: 'google' },
      { expiresIn: '30d' },
    );
    expect(result).toEqual({ access_token: 'jwt_token', userId: 'user_1' });
  });

  it('loginWithEmail сохраняет тот же JWT subject contract', async () => {
    const { service, jwtService, identityResolver } = makeService();
    identityResolver.resolveEmailLogin.mockResolvedValue({
      user: { id: 'user_email', authProvider: 'email', isBlocked: false },
      provider: AuthIdentityProvider.EMAIL,
    });

    await service.loginWithEmail('user@example.com');

    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'user_email', type: 'user', provider: 'email' },
      { expiresIn: '30d' },
    );
  });
});
