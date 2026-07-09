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
      user: { id: 'user_1', isBlocked: false },
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
      user: { id: 'user_email', isBlocked: false },
      provider: AuthIdentityProvider.EMAIL,
    });

    await service.loginWithEmail('user@example.com');

    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'user_email', type: 'user', provider: 'email' },
      { expiresIn: '30d' },
    );
  });

  it('getMe не выбирает и не возвращает legacy identity slot', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      telegramId: 123456789n,
      username: 'mojo_user',
      firstName: 'Mojo',
      lastName: 'User',
      phone: null,
      email: 'user@example.com',
      authProvider: 'google',
      providerId: 'secret-provider-subject',
      balance: 100,
      bonusBalance: 25,
      referralCode: 'REF1',
      referredById: null,
      referralLinkId: null,
      totalSpent: 1000,
      isBlocked: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getMe('user_1');
    const select = prisma.user.findUnique.mock.calls[0][0].select;

    expect(select).not.toHaveProperty('authProvider');
    expect(select).not.toHaveProperty('providerId');
    expect(result).toEqual(expect.objectContaining({
      id: 'user_1',
      telegramId: '123456789',
      email: 'user@example.com',
    }));
    expect(result).not.toHaveProperty('authProvider');
    expect(result).not.toHaveProperty('providerId');
  });
});
