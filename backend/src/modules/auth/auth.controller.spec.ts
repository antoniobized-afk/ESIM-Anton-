import 'reflect-metadata';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    loginAdmin: jest.fn(),
    createAdmin: jest.fn(),
    verifyToken: jest.fn(),
    getMe: jest.fn(),
    loginWithOAuth: jest.fn(),
    loginWithEmail: jest.fn(),
  };
  const emailCodeService = {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
  };
  const oauthService = {
    getGoogleRedirectUrl: jest.fn(),
    exchangeGoogleCode: jest.fn(),
    getYandexRedirectUrl: jest.fn(),
    exchangeYandexCode: jest.fn(),
    getVkRedirectUrl: jest.fn(),
    exchangeVkCode: jest.fn(),
    verifyTelegramWidget: jest.fn(),
    verifyTelegramWebAppInitData: jest.fn(),
  };
  const identityManagementService = {
    listForUser: jest.fn(),
    startOAuthLink: jest.fn(),
    linkEmail: jest.fn(),
    linkTelegramProfile: jest.fn(),
    unlinkIdentity: jest.fn(),
    handleOAuthLinkCallback: jest.fn(),
    isOAuthLinkState: jest.fn(),
  };
  const callbackUrlService = {
    getOAuthCallbackUrl: jest.fn(),
    getFrontendUrl: jest.fn(),
  };
  const miniAppCapture = {
    enqueueVerifiedMiniAppLaunch: jest.fn(),
  };
  const referralsService = {
    registerReferral: jest.fn(),
  };

  const controller = new AuthController(
    authService as any,
    emailCodeService as any,
    oauthService as any,
    identityManagementService as any,
    callbackUrlService as any,
    miniAppCapture as any,
    referralsService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    identityManagementService.handleOAuthLinkCallback.mockResolvedValue(null);
    identityManagementService.isOAuthLinkState.mockReturnValue(false);
    callbackUrlService.getOAuthCallbackUrl.mockReturnValue(
      'https://api.example.com/api/auth/oauth/google/callback',
    );
    callbackUrlService.getFrontendUrl.mockReturnValue('https://app.example.com');
    miniAppCapture.enqueueVerifiedMiniAppLaunch.mockResolvedValue({ id: 'intent_1' });
    referralsService.registerReferral.mockResolvedValue({ id: 'referrer_1' });
  });

  // ─── Admin ────────────────────────────────────────────────────

  it('registerAdmin отклоняет non-SUPER_ADMIN', async () => {
    await expect(
      controller.registerAdmin(
        { id: 'admin_1', type: 'admin', role: 'MANAGER' },
        { email: 'new@example.com', password: 'secret123' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('registerAdmin создаёт админа для SUPER_ADMIN', async () => {
    authService.createAdmin.mockResolvedValue({ id: 'admin_2' });

    const result = await controller.registerAdmin(
      { id: 'admin_1', type: 'admin', role: 'SUPER_ADMIN' },
      { email: 'new@example.com', password: 'secret123', role: 'SUPPORT' },
    );

    expect(authService.createAdmin).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'secret123',
      role: 'SUPPORT',
    });
    expect(result).toEqual({ id: 'admin_2' });
  });

  // ─── getMe ────────────────────────────────────────────────────

  it('getMe использует JwtUserGuard и читает user.id из auth context', async () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.getMe);
    authService.getMe.mockResolvedValue({ id: 'user_1' });

    const result = await controller.getMe({ id: 'user_1', type: 'user' });

    expect(guards).toEqual([JwtUserGuard]);
    expect(authService.getMe).toHaveBeenCalledWith('user_1');
    expect(result).toEqual({ id: 'user_1' });
  });

  // ─── Email Auth ───────────────────────────────────────────────

  describe('sendEmailCode', () => {
    it('отклоняет запрос без email', async () => {
      await expect(
        controller.sendEmailCode({ email: '' }),
      ).rejects.toThrow(BadRequestException);
      expect(emailCodeService.sendCode).not.toHaveBeenCalled();
    });

    it('вызывает emailCodeService.sendCode и возвращает success', async () => {
      emailCodeService.sendCode.mockResolvedValue(undefined);

      const result = await controller.sendEmailCode({ email: 'test@example.com' });

      expect(emailCodeService.sendCode).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual({ success: true, message: 'Код отправлен на email' });
    });
  });

  describe('verifyEmail', () => {
    it('отклоняет запрос без email', async () => {
      await expect(
        controller.verifyEmail({ email: '', code: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('отклоняет запрос без code', async () => {
      await expect(
        controller.verifyEmail({ email: 'test@example.com', code: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('отклоняет неверный код', async () => {
      emailCodeService.verifyCode.mockResolvedValue(false);

      await expect(
        controller.verifyEmail({ email: 'test@example.com', code: '000000' }),
      ).rejects.toThrow(BadRequestException);

      expect(emailCodeService.verifyCode).toHaveBeenCalledWith('test@example.com', '000000');
      expect(authService.loginWithEmail).not.toHaveBeenCalled();
    });

    it('при верном коде вызывает loginWithEmail и возвращает токен', async () => {
      emailCodeService.verifyCode.mockResolvedValue(true);
      authService.loginWithEmail.mockResolvedValue({
        access_token: 'jwt_token_123',
        userId: 'user_1',
      });

      const result = await controller.verifyEmail({
        email: '  Test@Example.com  ',
        code: '123456',
      });

      // email нормализуется в controller: trim + lowercase
      expect(emailCodeService.verifyCode).toHaveBeenCalledWith('test@example.com', '123456');
      expect(authService.loginWithEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual({ access_token: 'jwt_token_123', userId: 'user_1' });
    });
  });

  describe('OAuth callbacks', () => {
    it('обычный OAuth login callback нормализует external state в safe returnTo', async () => {
      oauthService.exchangeGoogleCode.mockResolvedValue({
        provider: 'google',
        providerId: 'google_1',
      });
      authService.loginWithOAuth.mockResolvedValue({ access_token: 'jwt_token' });
      const res = { redirect: jest.fn() };

      await controller.googleCallback(
        { headers: {}, protocol: 'https' } as any,
        'oauth-code',
        'https://evil.example/phish',
        res as any,
      );

      expect(identityManagementService.handleOAuthLinkCallback).toHaveBeenCalled();
      expect(authService.loginWithOAuth).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://app.example.com/login/callback?token=jwt_token&returnTo=%2F',
      );
    });

    it('обычный OAuth login callback сохраняет только safe relative state', async () => {
      oauthService.exchangeGoogleCode.mockResolvedValue({
        provider: 'google',
        providerId: 'google_1',
      });
      authService.loginWithOAuth.mockResolvedValue({ access_token: 'jwt_token' });
      const res = { redirect: jest.fn() };

      await controller.googleCallback(
        { headers: {}, protocol: 'https' } as any,
        'oauth-code',
        '%2Fprofile%3Ftab%3Dlogin',
        res as any,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://app.example.com/login/callback?token=jwt_token&returnTo=%2Fprofile%3Ftab%3Dlogin',
      );
    });

    it('обычный OAuth login callback не падает на malformed state', async () => {
      oauthService.exchangeGoogleCode.mockResolvedValue({
        provider: 'google',
        providerId: 'google_1',
      });
      authService.loginWithOAuth.mockResolvedValue({ access_token: 'jwt_token' });
      const res = { redirect: jest.fn() };

      await controller.googleCallback(
        { headers: {}, protocol: 'https' } as any,
        'oauth-code',
        '%E0%A4%A',
        res as any,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://app.example.com/login/callback?token=jwt_token&returnTo=%2F',
      );
    });

    it('invalid signed OAuth link-state редиректит в profile error и не запускает login fallback', async () => {
      oauthService.exchangeGoogleCode.mockResolvedValue({
        provider: 'google',
        providerId: 'google_1',
      });
      identityManagementService.handleOAuthLinkCallback.mockRejectedValue(
        new UnauthorizedException({
          code: 'OAUTH_LINK_STATE_INVALID',
          message: 'OAuth link state is invalid or expired.',
        }),
      );
      identityManagementService.isOAuthLinkState.mockReturnValue(true);
      const res = { redirect: jest.fn() };

      await controller.googleCallback(
        { headers: {}, protocol: 'https' } as any,
        'oauth-code',
        'signed-like-state',
        res as any,
      );

      expect(authService.loginWithOAuth).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://app.example.com/profile?identityLink=error&identityError=OAUTH_LINK_STATE_INVALID',
      );
    });
  });

  it('ставит campaign Mini App launch в marketing intent только после verified initData и login', async () => {
    oauthService.verifyTelegramWebAppInitData.mockReturnValue({
      provider: 'telegram',
      providerId: '123456789',
      telegramWebAppStartParam: 'ma_Campaign123',
      telegramWebAppEventKey: 'telegram-mini-app:event_1',
    });
    authService.loginWithOAuth.mockResolvedValue({
      access_token: 'jwt_token',
      userId: 'user_1',
    });

    await expect(
      controller.telegramWebAppAuth({ initData: 'verified-init-data' }),
    ).resolves.toEqual({
      access_token: 'jwt_token',
      userId: 'user_1',
    });

    expect(authService.loginWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'telegram', providerId: '123456789' }),
    );
    expect(miniAppCapture.enqueueVerifiedMiniAppLaunch).toHaveBeenCalledWith({
      userId: 'user_1',
      telegramId: '123456789',
      startParam: 'ma_Campaign123',
      sourceEventKey: 'telegram-mini-app:event_1',
    });
  });

  it('не пишет intent для existing Mini App login без campaign launch', async () => {
    oauthService.verifyTelegramWebAppInitData.mockReturnValue({
      provider: 'telegram',
      providerId: '123456789',
      telegramWebAppEventKey: 'telegram-mini-app:event_1',
    });
    authService.loginWithOAuth.mockResolvedValue({
      access_token: 'jwt_token',
      userId: 'user_1',
    });
    await expect(
      controller.telegramWebAppAuth({ initData: 'verified-init-data' }),
    ).resolves.toEqual({
      access_token: 'jwt_token',
      userId: 'user_1',
    });

    expect(miniAppCapture.enqueueVerifiedMiniAppLaunch).not.toHaveBeenCalled();
    expect(referralsService.registerReferral).not.toHaveBeenCalled();
  });

  it('применяет ref_ только из verified Mini App initData через referral owner', async () => {
    oauthService.verifyTelegramWebAppInitData.mockReturnValue({
      provider: 'telegram',
      providerId: '123456789',
      telegramWebAppStartParam: 'ref_ANASTASIAV',
      telegramWebAppEventKey: 'telegram-mini-app:event_1',
    });
    authService.loginWithOAuth.mockResolvedValue({
      access_token: 'jwt_token',
      userId: 'user_1',
    });

    await expect(
      controller.telegramWebAppAuth({ initData: 'verified-init-data' }),
    ).resolves.toEqual({
      access_token: 'jwt_token',
      userId: 'user_1',
    });

    expect(referralsService.registerReferral).toHaveBeenCalledWith(
      'user_1',
      'ANASTASIAV',
      BigInt('123456789'),
    );
    expect(miniAppCapture.enqueueVerifiedMiniAppLaunch).not.toHaveBeenCalled();
  });

  it('не отменяет verified Mini App login при временной ошибке referral owner', async () => {
    oauthService.verifyTelegramWebAppInitData.mockReturnValue({
      provider: 'telegram',
      providerId: '123456789',
      telegramWebAppStartParam: 'ref_ANASTASIAV',
      telegramWebAppEventKey: 'telegram-mini-app:event_1',
    });
    authService.loginWithOAuth.mockResolvedValue({
      access_token: 'jwt_token',
      userId: 'user_1',
    });
    referralsService.registerReferral.mockRejectedValue(new Error('database unavailable'));

    await expect(
      controller.telegramWebAppAuth({ initData: 'verified-init-data' }),
    ).resolves.toEqual({
      access_token: 'jwt_token',
      userId: 'user_1',
    });

    expect(referralsService.registerReferral).toHaveBeenCalledWith(
      'user_1',
      'ANASTASIAV',
      BigInt('123456789'),
    );
  });

  it('не отменяет успешный Mini App login, если campaign intent временно не записался', async () => {
    oauthService.verifyTelegramWebAppInitData.mockReturnValue({
      provider: 'telegram',
      providerId: '123456789',
      telegramWebAppStartParam: 'ma_Campaign123',
      telegramWebAppEventKey: 'telegram-mini-app:event_1',
    });
    authService.loginWithOAuth.mockResolvedValue({
      access_token: 'jwt_token',
      userId: 'user_1',
    });
    miniAppCapture.enqueueVerifiedMiniAppLaunch.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      controller.telegramWebAppAuth({ initData: 'verified-init-data' }),
    ).resolves.toEqual({
      access_token: 'jwt_token',
      userId: 'user_1',
    });

    expect(miniAppCapture.enqueueVerifiedMiniAppLaunch).toHaveBeenCalledWith({
      userId: 'user_1',
      telegramId: '123456789',
      startParam: 'ma_Campaign123',
      sourceEventKey: 'telegram-mini-app:event_1',
    });
  });
});
