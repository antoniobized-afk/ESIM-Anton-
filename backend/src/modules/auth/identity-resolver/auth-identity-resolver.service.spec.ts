import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AuthIdentityProvider,
  Prisma,
  UserIdentityAuditEvent,
} from '@prisma/client';
import { AuthIdentityAuditService } from './auth-identity-audit.service';
import { AuthIdentityResolverService } from './auth-identity-resolver.service';
import { OAuthIdentityProfileMapper } from './oauth-identity-profile.mapper';
import { MarketingAttributionMiniAppCaptureService } from '@/modules/marketing-attribution/marketing-attribution-mini-app-capture.service';

function loginUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    isBlocked: false,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({ id: 'identity_1' }),
    },
    userIdentityAudit: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(loginUser()),
    },
    $transaction: jest.fn().mockImplementation(async (callback: any) => callback(prisma)),
  };
  const marketingLifecycle = {
    initializeRegistrationAttributionForNewUser: jest.fn().mockResolvedValue({ id: 'state_1' }),
  };
  const miniAppCapture = {
    enqueueVerifiedMiniAppLaunchInTransaction: jest.fn().mockResolvedValue({ id: 'intent_1' }),
  };

  return {
    prisma,
    marketingLifecycle,
    miniAppCapture,
    service: new AuthIdentityResolverService(
      prisma as any,
      new OAuthIdentityProfileMapper(),
      new AuthIdentityAuditService(),
      marketingLifecycle as any,
      miniAppCapture as unknown as MarketingAttributionMiniAppCaptureService,
    ),
  };
}

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('AuthIdentityResolverService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('создаёт registration eligibility вместе с новым email аккаунтом', async () => {
    const { service, prisma, marketingLifecycle } = makeService();

    await service.resolveEmailLogin('new@example.com');

    expect(prisma.user.create).toHaveBeenCalled();
    expect(marketingLifecycle.initializeRegistrationAttributionForNewUser).toHaveBeenCalledWith(
      prisma,
      'user_1',
    );
  });

  it('создаёт registration eligibility и durable Mini App intent в transaction нового account', async () => {
    const { service, prisma, marketingLifecycle, miniAppCapture } = makeService();

    await service.resolveOAuthLogin({
      provider: 'telegram',
      providerId: '123456789',
      username: 'mojo_user',
      telegramWebAppStartParam: 'ma_Campaign123',
      telegramWebAppEventKey: 'telegram-mini-app:event_1',
    });

    expect(marketingLifecycle.initializeRegistrationAttributionForNewUser).toHaveBeenCalledWith(
      prisma,
      'user_1',
    );
    expect(miniAppCapture.enqueueVerifiedMiniAppLaunchInTransaction).toHaveBeenCalledWith(
      prisma,
      {
        userId: 'user_1',
        telegramId: '123456789',
        startParam: 'ma_Campaign123',
        sourceEventKey: 'telegram-mini-app:event_1',
      },
    );
  });

  it('email login создает EMAIL identity для существующего user.email без смены User.id', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue(loginUser({
      id: 'email_user',
    }));

    const result = await service.resolveEmailLogin('  Test@Example.com  ');

    expect(result).toEqual({
      user: expect.objectContaining({ id: 'email_user' }),
      provider: AuthIdentityProvider.EMAIL,
    });
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: AuthIdentityProvider.EMAIL,
        providerSubject: 'test@example.com',
        email: 'test@example.com',
        emailVerified: true,
        user: { connect: { id: 'email_user' } },
      }),
      select: { id: true },
    });
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LINKED,
        userId: 'email_user',
        provider: AuthIdentityProvider.EMAIL,
        providerSubjectHash: expect.any(String),
        providerSubjectPreview: 'te***@example.com',
        after: expect.not.objectContaining({
          email: 'test@example.com',
          providerSubject: 'test@example.com',
        }),
      }),
    });
    const auditPayload = prisma.userIdentityAudit.create.mock.calls[0][0].data;
    expect(auditPayload.after).toEqual(
      expect.objectContaining({
        emailHash: expect.any(String),
        emailPreview: 'te***@example.com',
      }),
    );
  });

  it('email login сохраняет continuity для legacy users.email с отличающимся регистром', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([
      loginUser({ id: 'mixed_case_email_user' }),
    ]);

    const result = await service.resolveEmailLogin('test@example.com');

    expect(result.user.id).toBe('mixed_case_email_user');
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        email: {
          equals: 'test@example.com',
          mode: 'insensitive',
        },
      },
      select: expect.any(Object),
      orderBy: { id: 'asc' },
      take: 2,
    });
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: AuthIdentityProvider.EMAIL,
        providerSubject: 'test@example.com',
        user: { connect: { id: 'mixed_case_email_user' } },
      }),
      select: { id: true },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('email login блокирует duplicate normalized legacy users.email вместо выбора случайного User', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([
      loginUser({ id: 'email_user_a' }),
      loginUser({ id: 'email_user_b' }),
    ]);

    await expect(service.resolveEmailLogin('test@example.com')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'email_user_a',
        provider: AuthIdentityProvider.EMAIL,
        reason: 'email_normalized_duplicate',
        metadata: expect.objectContaining({
          source: 'identity_resolver_login',
          attemptedUserId: 'email_user_a',
          conflictingUserId: 'email_user_b',
          emailPreview: 'te***@example.com',
          rawProviderPayloadStored: false,
        }),
      }),
    });
  });

  it('OAuth login не делает silent attach по совпавшему email', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'email_owner' });

    let response: unknown;
    await service.resolveOAuthLogin({
      provider: 'google',
      providerId: 'google_subject_1',
      email: 'owner@example.com',
    }).catch((error) => {
      response = error.getResponse();
      expect(error).toBeInstanceOf(ConflictException);
    });

    expect(response).toEqual(expect.not.objectContaining({ userId: 'email_owner' }));
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'email_owner',
        provider: AuthIdentityProvider.GOOGLE,
        providerSubjectHash: expect.any(String),
        providerSubjectPreview: 'goo..._1',
        reason: 'oauth_email_already_used',
        metadata: expect.objectContaining({
          source: 'identity_resolver_login',
          conflictingUserId: 'email_owner',
          emailHash: expect.any(String),
          emailPreview: 'ow***@example.com',
          rawProviderPayloadStored: false,
        }),
      }),
    });
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(prisma.userIdentityAudit.create.mock.calls),
    ).not.toContain('google_subject_1');
    expect(
      JSON.stringify(prisma.userIdentityAudit.create.mock.calls),
    ).not.toContain('owner@example.com');
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('email login пишет LOGIN_CONFLICT при concurrent identity race', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(loginUser({
      id: 'email_user',
    }));
    prisma.userIdentity.create.mockRejectedValueOnce(uniqueConstraintError());

    await expect(service.resolveEmailLogin('race@example.com')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'email_user',
        provider: AuthIdentityProvider.EMAIL,
        providerSubjectHash: expect.any(String),
        providerSubjectPreview: 'ra***@example.com',
        reason: 'PROVIDER_IDENTITY_ALREADY_LINKED',
        metadata: expect.objectContaining({
          attemptedUserId: 'email_user',
          emailHash: expect.any(String),
          emailPreview: 'ra***@example.com',
          rawProviderPayloadStored: false,
        }),
      }),
    });
  });

  it('email login запрещает второй EMAIL identity для одного canonical user', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(loginUser({
      id: 'email_user',
    }));
    prisma.userIdentity.findFirst.mockResolvedValue({
      id: 'existing_email_identity',
    });

    await expect(service.resolveEmailLogin('second@example.com')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'email_user',
        provider: AuthIdentityProvider.EMAIL,
        reason: 'PROVIDER_ALREADY_LINKED_TO_USER',
        metadata: expect.objectContaining({
          attemptedUserId: 'email_user',
          emailPreview: 'se***@example.com',
        }),
      }),
    });
  });

  it('OAuth login не обходит collision, если email занят EMAIL identity другого user', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'email_identity', userId: 'email_owner' });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveOAuthLogin({
        provider: 'google',
        providerId: 'google_subject_2',
        email: 'owner@example.com',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'email_owner',
        provider: AuthIdentityProvider.GOOGLE,
        reason: 'oauth_email_already_used',
        metadata: expect.objectContaining({
          conflictingUserId: 'email_owner',
          emailPreview: 'ow***@example.com',
          rawProviderPayloadStored: false,
        }),
      }),
    });
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('Telegram OAuth связывает identity с existing bot-only user по telegramId', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue(loginUser({ id: 'telegram_user' }));

    const result = await service.resolveOAuthLogin({
      provider: 'telegram',
      providerId: '123456789',
      username: 'mojo_user',
    });

    expect(result.user.id).toBe('telegram_user');
    expect(result.provider).toBe(AuthIdentityProvider.TELEGRAM);
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: AuthIdentityProvider.TELEGRAM,
        providerSubject: '123456789',
        user: { connect: { id: 'telegram_user' } },
      }),
      select: { id: true },
    });
  });

  it('Telegram login блокирует identity/contact split-brain с чужим User.telegramId', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue({
      id: 'identity_telegram',
      userId: 'identity_user',
      user: loginUser({ id: 'identity_user', telegramId: null }),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'contact_owner' });

    await expect(
      service.resolveOAuthLogin({
        provider: 'telegram',
        providerId: '123456789',
        username: 'mojo_user',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.userIdentity.update).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'identity_user',
        provider: AuthIdentityProvider.TELEGRAM,
        reason: 'TELEGRAM_CONTACT_ALREADY_USED_BY_ANOTHER_ACCOUNT',
        metadata: expect.objectContaining({
          attemptedUserId: 'identity_user',
          conflictingUserId: 'contact_owner',
          hasTelegramId: true,
          rawProviderPayloadStored: false,
        }),
      }),
    });
  });

  it('Telegram login блокирует identity, если она расходится с User.telegramId своего user', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue({
      id: 'identity_telegram',
      userId: 'identity_user',
      user: loginUser({ id: 'identity_user', telegramId: 987654321n }),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'identity_user' });

    await expect(
      service.resolveOAuthLogin({
        provider: 'telegram',
        providerId: '123456789',
        username: 'mojo_user',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.userIdentity.update).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'identity_user',
        provider: AuthIdentityProvider.TELEGRAM,
        reason: 'TELEGRAM_IDENTITY_CONTACT_DRIFT',
        metadata: expect.objectContaining({
          attemptedUserId: 'identity_user',
          hasTelegramId: true,
          rawProviderPayloadStored: false,
        }),
      }),
    });
  });

  it('не выдает login result для заблокированного canonical user', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue({
      id: 'identity_1',
      user: loginUser({ isBlocked: true }),
    });

    await expect(service.resolveEmailLogin('blocked@example.com')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.userIdentity.update).not.toHaveBeenCalled();
  });

  it('bot registration идемпотентно возвращает user по существующей Telegram identity', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue({
      id: 'identity_telegram',
      user: {
        id: 'bot_user',
        telegramId: 123456789n,
        isBlocked: false,
        loyaltyLevel: null,
      },
    });

    const result = await service.resolveTelegramBotUser({
      telegramId: 123456789n,
      username: 'mojo_user',
    });

    expect(result.id).toBe('bot_user');
    expect(prisma.userIdentity.update).toHaveBeenCalledWith({
      where: { id: 'identity_telegram' },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
  });
});
