import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { AuthIdentityController } from './auth-identity.controller';

describe('AuthIdentityController', () => {
  const emailCodeService = {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
  };
  const oauthService = {
    verifyTelegramWidget: jest.fn(),
    verifyTelegramWebAppInitData: jest.fn(),
  };
  const identityManagementService = {
    listForUser: jest.fn(),
    startOAuthLink: jest.fn(),
    linkEmail: jest.fn(),
    linkTelegramProfile: jest.fn(),
    unlinkIdentity: jest.fn(),
  };
  const callbackUrlService = {
    getOAuthCallbackUrl: jest.fn(),
  };

  const controller = new AuthIdentityController(
    emailCodeService as any,
    oauthService as any,
    identityManagementService as any,
    callbackUrlService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    callbackUrlService.getOAuthCallbackUrl.mockReturnValue(
      'https://api.example.com/api/auth/oauth/google/callback',
    );
  });

  it('getMyIdentities использует JwtUserGuard и читает user.id из auth context', async () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthIdentityController.prototype.getMyIdentities,
    );
    identityManagementService.listForUser.mockResolvedValue({ identities: [] });

    const result = await controller.getMyIdentities({ id: 'user_1', type: 'user' });

    expect(guards).toEqual([JwtUserGuard]);
    expect(identityManagementService.listForUser).toHaveBeenCalledWith('user_1');
    expect(result).toEqual({ identities: [] });
  });

  it('startOAuthIdentityLink создает redirect url через signed state контур', async () => {
    identityManagementService.startOAuthLink.mockResolvedValue({
      url: 'https://accounts.example/link',
    });

    const result = await controller.startOAuthIdentityLink(
      { id: 'user_1', type: 'user' },
      { headers: {}, protocol: 'https' } as any,
      'google',
      { returnTo: '/profile' },
    );

    expect(callbackUrlService.getOAuthCallbackUrl).toHaveBeenCalledWith(
      'google',
      expect.any(Object),
    );
    expect(identityManagementService.startOAuthLink).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        provider: 'google',
        redirectUri: 'https://api.example.com/api/auth/oauth/google/callback',
        returnTo: '/profile',
      }),
    );
    expect(result).toEqual({ url: 'https://accounts.example/link' });
  });

  it('startOAuthIdentityLink отклоняет provider вне link allowlist до URL и service call', async () => {
    await expect(
      controller.startOAuthIdentityLink(
        { id: 'user_1', type: 'user' },
        { headers: {}, protocol: 'https' } as any,
        'vk',
        { returnTo: '/profile' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(callbackUrlService.getOAuthCallbackUrl).not.toHaveBeenCalled();
    expect(identityManagementService.startOAuthLink).not.toHaveBeenCalled();
  });

  it('email identity link endpoints используют OTP throttling профиль', () => {
    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        AuthIdentityController.prototype.sendEmailIdentityLinkCode,
      ),
    ).toBe(3);
    expect(
      Reflect.getMetadata(
        `${THROTTLER_TTL}default`,
        AuthIdentityController.prototype.sendEmailIdentityLinkCode,
      ),
    ).toBe(60000);
    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        AuthIdentityController.prototype.verifyEmailIdentityLink,
      ),
    ).toBe(10);
    expect(
      Reflect.getMetadata(
        `${THROTTLER_TTL}default`,
        AuthIdentityController.prototype.verifyEmailIdentityLink,
      ),
    ).toBe(60000);
  });

  it('verifyEmailIdentityLink нормализует email после OTP и вызывает domain service', async () => {
    emailCodeService.verifyCode.mockResolvedValue(true);
    identityManagementService.linkEmail.mockResolvedValue({ status: 'linked' });

    const result = await controller.verifyEmailIdentityLink(
      { id: 'user_1', type: 'user' },
      { email: '  Test@Example.com  ', code: '123456' },
    );

    expect(emailCodeService.verifyCode).toHaveBeenCalledWith('test@example.com', '123456');
    expect(identityManagementService.linkEmail).toHaveBeenCalledWith(
      'user_1',
      'test@example.com',
    );
    expect(result).toEqual({ status: 'linked' });
  });

  it('unlinkIdentity передает только текущий user.id и identity id', async () => {
    identityManagementService.unlinkIdentity.mockResolvedValue({ success: true });

    const result = await controller.unlinkIdentity(
      { id: 'user_1', type: 'user' },
      'identity_1',
    );

    expect(identityManagementService.unlinkIdentity).toHaveBeenCalledWith(
      'user_1',
      'identity_1',
    );
    expect(result).toEqual({ success: true });
  });
});
