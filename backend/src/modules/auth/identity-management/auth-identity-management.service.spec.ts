import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthIdentityProvider, Prisma, UserIdentityAuditEvent } from '@prisma/client';
import { AuthIdentityAuditService } from '../identity-resolver/auth-identity-audit.service';
import { OAuthIdentityProfileMapper } from '../identity-resolver/oauth-identity-profile.mapper';
import { AuthIdentityLinkStateService } from './auth-identity-link-state.service';
import { AuthIdentityManagementService } from './auth-identity-management.service';

function makeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'identity_1',
    userId: 'user_1',
    provider: AuthIdentityProvider.GOOGLE,
    providerSubject: 'google_1',
    email: null,
    emailVerified: false,
    displayName: null,
    linkedAt: new Date('2026-06-07T00:00:00Z'),
    lastLoginAt: null,
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    userIdentity: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(2),
      create: jest.fn().mockResolvedValue({ id: 'identity_2' }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    userIdentityAudit: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user_1', isBlocked: false }),
      update: jest.fn(),
    },
    order: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    transaction: {
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    cloudPaymentsCardToken: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (callback: any) => callback(prisma)),
  };
  const oauthService = {
    getGoogleRedirectUrl: jest.fn().mockReturnValue('https://google.example/auth'),
    getYandexRedirectUrl: jest.fn().mockReturnValue('https://yandex.example/auth'),
  };
  const configService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  return {
    prisma,
    oauthService,
    service: new AuthIdentityManagementService(
      prisma as any,
      oauthService as any,
      new AuthIdentityLinkStateService(configService as any),
      new OAuthIdentityProfileMapper(),
      new AuthIdentityAuditService(),
    ),
  };
}

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('AuthIdentityManagementService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('listForUser возвращает identities и не показывает VK как user-facing provider', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findMany.mockResolvedValue([
      makeIdentity({ provider: AuthIdentityProvider.GOOGLE }),
    ]);

    const result = await service.listForUser('user_1');

    expect(result.identities).toEqual([
      expect.objectContaining({
        id: 'identity_1',
        provider: AuthIdentityProvider.GOOGLE,
        label: 'Google',
        canUnlink: false,
      }),
    ]);
    expect(result.availableProviders).not.toContain(AuthIdentityProvider.VK);
  });

  it('unlink запрещает удалять последний usable identity', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(makeIdentity());
    prisma.userIdentity.count.mockResolvedValue(1);

    await expect(service.unlinkIdentity('user_1', 'identity_1')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentity.delete).not.toHaveBeenCalled();
  });

  it('unlink пишет audit snapshot перед физическим удалением identity', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(makeIdentity());
    prisma.userIdentity.count.mockResolvedValue(2);

    await service.unlinkIdentity('user_1', 'identity_1');

    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.UNLINKED,
        identityId: 'identity_1',
        userId: 'user_1',
        providerSubjectHash: expect.any(String),
        before: expect.not.objectContaining({ providerSubject: 'google_1' }),
      }),
    });
    const auditPayload = prisma.userIdentityAudit.create.mock.calls[0][0].data;
    expect(auditPayload.before).toEqual(
      expect.objectContaining({
        providerSubjectHash: expect.any(String),
        providerSubjectPreview: 'goo..._1',
      }),
    );
    expect(auditPayload.before).not.toHaveProperty('email');
    expect(prisma.userIdentity.delete).toHaveBeenCalledWith({ where: { id: 'identity_1' } });
  });

  it('explicit email link не переносит business ownership и не меняет contact fields', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(null);

    await service.linkEmail('user_1', 'new@example.com');

    expect(prisma.userIdentity.create).toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          source: 'identity_management_explicit_link',
        }),
      }),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.cloudPaymentsCardToken.update).not.toHaveBeenCalled();
    expect(prisma.cloudPaymentsCardToken.updateMany).not.toHaveBeenCalled();
  });

  it('explicit link возвращает controlled conflict при concurrent provider identity race', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.userIdentity.create.mockRejectedValueOnce(uniqueConstraintError());

    await expect(service.linkEmail('user_1', 'new@example.com')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'user_1',
        actorId: 'user_1',
        provider: AuthIdentityProvider.EMAIL,
        reason: 'PROVIDER_IDENTITY_ALREADY_LINKED',
        metadata: expect.objectContaining({
          source: 'identity_management_explicit_link',
          attemptedUserId: 'user_1',
          emailPreview: 'ne***@example.com',
          rawProviderPayloadStored: false,
        }),
      }),
    });
  });

  it('explicit link запрещает второй identity того же provider для одного user', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.userIdentity.findFirst.mockResolvedValue({
      id: 'existing_email_identity',
    });

    await expect(service.linkEmail('user_1', 'second@example.com')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'user_1',
        actorId: 'user_1',
        provider: AuthIdentityProvider.EMAIL,
        reason: 'PROVIDER_ALREADY_LINKED_TO_USER',
        metadata: expect.objectContaining({
          source: 'identity_management_explicit_link',
          attemptedUserId: 'user_1',
          emailPreview: 'se***@example.com',
        }),
      }),
    });
  });

  it('unlink не переносит orders/payments/saved cards и не очищает User.email/telegramId', async () => {
    const { service, prisma } = makeService();
    prisma.userIdentity.findUnique.mockResolvedValue(makeIdentity());
    prisma.userIdentity.count.mockResolvedValue(2);

    await service.unlinkIdentity('user_1', 'identity_1');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
    expect(prisma.cloudPaymentsCardToken.update).not.toHaveBeenCalled();
    expect(prisma.cloudPaymentsCardToken.updateMany).not.toHaveBeenCalled();
  });

  it('explicit Telegram link запрещает split-brain с User.telegramId другого user', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', isBlocked: false })
      .mockResolvedValueOnce({ id: 'other_user' });

    await expect(
      service.linkTelegramProfile('user_1', {
        provider: 'telegram',
        providerId: '123456789',
        username: 'mojo_user',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'user_1',
        actorId: 'user_1',
        provider: AuthIdentityProvider.TELEGRAM,
        reason: 'TELEGRAM_CONTACT_ALREADY_USED_BY_ANOTHER_ACCOUNT',
        metadata: expect.objectContaining({
          source: 'identity_management_explicit_link',
          attemptedUserId: 'user_1',
          conflictingUserId: 'other_user',
          hasTelegramId: true,
          rawProviderPayloadStored: false,
        }),
      }),
    });
  });

  it('startOAuthLink возвращает provider redirect со signed state', async () => {
    const { service } = makeService();

    const result = await service.startOAuthLink({
      userId: 'user_1',
      provider: 'google',
      redirectUri: 'https://api.example.com/callback',
      returnTo: '/profile',
    });

    expect(result.url).toContain('https://google.example/auth&state=');
  });

  it('startOAuthLink отклоняет provider вне explicit OAuth link allowlist', async () => {
    const { service, oauthService } = makeService();

    await expect(
      service.startOAuthLink({
        userId: 'user_1',
        provider: 'vk',
        redirectUri: 'https://api.example.com/callback',
        returnTo: '/profile',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(oauthService.getGoogleRedirectUrl).not.toHaveBeenCalled();
    expect(oauthService.getYandexRedirectUrl).not.toHaveBeenCalled();
  });

  it('signed-like invalid OAuth link state не падает в обычный login flow', async () => {
    const { service } = makeService();
    const invalidState = Buffer.from(
      JSON.stringify({ v: 1, action: 'link', provider: 'google' }),
    ).toString('base64url') + '.bad-signature';

    await expect(
      service.handleOAuthLinkCallback(
        { provider: 'google', providerId: 'google_1' },
        invalidState,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('explicit OAuth link допускает provider link, если OAuth email является contact/email identity другого user', async () => {
    const { service, prisma } = makeService();
    const { url } = await service.startOAuthLink({
      userId: 'user_1',
      provider: 'google',
      redirectUri: 'https://api.example.com/callback',
      returnTo: '/profile',
    });
    const state = decodeURIComponent(url.split('&state=')[1]);

    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', isBlocked: false })
      .mockResolvedValueOnce(null);

    const result = await service.handleOAuthLinkCallback(
      {
        provider: 'google',
        providerId: 'google_1',
        email: 'owner@example.com',
      },
      state,
    );

    expect(result).toEqual({
      handled: true,
      returnTo: '/profile',
      status: 'linked',
    });
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: AuthIdentityProvider.GOOGLE,
        providerSubject: 'google_1',
        email: 'owner@example.com',
        user: { connect: { id: 'user_1' } },
      }),
      select: { id: true },
    });
    expect(prisma.userIdentity.findUnique).not.toHaveBeenCalledWith({
      where: {
        provider_providerSubject: {
          provider: AuthIdentityProvider.EMAIL,
          providerSubject: 'owner@example.com',
        },
      },
      select: { userId: true },
    });
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LINKED,
        userId: 'user_1',
        actorId: 'user_1',
        provider: AuthIdentityProvider.GOOGLE,
        reason: 'explicit_oauth_link',
        metadata: expect.objectContaining({
          source: 'identity_management_explicit_link',
        }),
      }),
    });
  });

  it('explicit OAuth link допускает provider link, даже если OAuth email совпадает с User.email текущего user и EMAIL identity другого user', async () => {
    const { service, prisma } = makeService();
    const { url } = await service.startOAuthLink({
      userId: 'user_1',
      provider: 'google',
      redirectUri: 'https://api.example.com/callback',
      returnTo: '/profile',
    });
    const state = decodeURIComponent(url.split('&state=')[1]);

    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', isBlocked: false })
      .mockResolvedValueOnce({ id: 'user_1' });

    const result = await service.handleOAuthLinkCallback(
      {
        provider: 'google',
        providerId: 'google_1',
        email: 'owner@example.com',
      },
      state,
    );

    expect(result?.status).toBe('linked');
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: AuthIdentityProvider.GOOGLE,
        providerSubject: 'google_1',
        email: 'owner@example.com',
        user: { connect: { id: 'user_1' } },
      }),
      select: { id: true },
    });
    expect(prisma.userIdentity.findUnique).not.toHaveBeenCalledWith({
      where: {
        provider_providerSubject: {
          provider: AuthIdentityProvider.EMAIL,
          providerSubject: 'owner@example.com',
        },
      },
      select: { userId: true },
    });
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LINKED,
        userId: 'user_1',
        actorId: 'user_1',
        provider: AuthIdentityProvider.GOOGLE,
        reason: 'explicit_oauth_link',
        metadata: expect.objectContaining({
          source: 'identity_management_explicit_link',
        }),
      }),
    });
  });

  it('explicit email link продолжает блокировать email другого аккаунта', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user_1', isBlocked: false })
      .mockResolvedValueOnce({ id: 'other_user' });

    await expect(service.linkEmail('user_1', 'owner@example.com')).rejects.toThrow(
      ConflictException,
    );

    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
    expect(prisma.userIdentityAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: UserIdentityAuditEvent.LOGIN_CONFLICT,
        userId: 'user_1',
        actorId: 'user_1',
        provider: AuthIdentityProvider.EMAIL,
        reason: 'EMAIL_ALREADY_USED_BY_ANOTHER_ACCOUNT',
      }),
    });
  });
});
