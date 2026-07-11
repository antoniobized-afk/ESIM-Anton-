import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Redirect,
  Res,
  BadRequestException,
  Logger,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, JwtAdminGuard, JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { AuthCallbackUrlService } from './auth-callback-url.service';
import { AuthService } from './auth.service';
import {
  SendEmailAuthCodeDto,
  TelegramWebAppAuthDto,
  VerifyEmailAuthCodeDto,
} from './dto/auth-login.dto';
import { EmailCodeService } from './email-code.service';
import { normalizeRelativeReturnTo } from './identity/auth-redirect-normalizer';
import { AuthIdentityManagementService } from './identity-management/auth-identity-management.service';
import { OAuthService } from './oauth.service';
import { MarketingAttributionMiniAppCaptureService } from '../marketing-attribution/marketing-attribution-mini-app-capture.service';
import { ReferralsService } from '../referrals/referrals.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly emailCodeService: EmailCodeService,
    private readonly oauthService: OAuthService,
    private readonly identityManagementService: AuthIdentityManagementService,
    private readonly callbackUrlService: AuthCallbackUrlService,
    private readonly miniAppCapture: MarketingAttributionMiniAppCaptureService,
    private readonly referralsService: ReferralsService,
  ) {}

  // ─── Admin ───────────────────────────────────────────────────

  @Post('login')
  @ApiOperation({ summary: 'Логин администратора' })
  async login(@Body() dto: { email: string; password: string }) {
    return this.authService.loginAdmin(dto.email, dto.password);
  }

  @Post('register-admin')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать администратора' })
  async registerAdmin(
    @CurrentUser() caller: AuthUser,
    @Body()
    dto: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      role?: 'SUPER_ADMIN' | 'MANAGER' | 'SUPPORT';
    },
  ) {
    if (caller.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can create admins');
    }
    return this.authService.createAdmin(dto);
  }

  // ─── Email Auth ───────────────────────────────────────────────

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('email/send-code')
  @ApiOperation({ summary: 'Отправить код на email' })
  async sendEmailCode(@Body() dto: SendEmailAuthCodeDto) {
    if (!dto.email) throw new BadRequestException('email required');
    await this.emailCodeService.sendCode(dto.email);
    return { success: true, message: 'Код отправлен на email' };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('email/verify')
  @ApiOperation({ summary: 'Верифицировать email код и получить JWT' })
  async verifyEmail(@Body() dto: VerifyEmailAuthCodeDto) {
    if (!dto.email || !dto.code) throw new BadRequestException('email and code required');
    const email = dto.email.trim().toLowerCase();
    const valid = await this.emailCodeService.verifyCode(email, dto.code);
    if (!valid) throw new BadRequestException('Неверный или просроченный код');
    return this.authService.loginWithEmail(email);
  }

  // ─── Google OAuth ─────────────────────────────────────────────

  @Get('oauth/google/redirect')
  @ApiOperation({ summary: 'Redirect to Google OAuth' })
  @Redirect()
  googleRedirect(@Req() req: Request, @Query('state') state?: string) {
    const redirectUri = this.callbackUrlService.getOAuthCallbackUrl('google', req);
    let url = this.oauthService.getGoogleRedirectUrl(redirectUri);
    if (state) url += `&state=${encodeURIComponent(state)}`;
    return { url, statusCode: 302 };
  }

  @Get('oauth/google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) return this.redirectError(res, state, 'Google auth cancelled');
    try {
      const redirectUri = this.callbackUrlService.getOAuthCallbackUrl('google', req);
      const profile = await this.oauthService.exchangeGoogleCode(code, redirectUri);
      const linkResult = await this.identityManagementService.handleOAuthLinkCallback(
        profile,
        state,
      );
      if (linkResult) return this.redirectLinkResult(res, linkResult);
      const { access_token } = await this.authService.loginWithOAuth(profile);
      return this.redirectSuccess(res, state, access_token);
    } catch (e: any) {
      const error = this.authErrorMessage(e);
      this.logger.error(`Google callback error: ${error}`);
      return this.redirectCallbackError(res, state, error);
    }
  }

  // ─── Yandex OAuth ─────────────────────────────────────────────

  @Get('oauth/yandex/redirect')
  @ApiOperation({ summary: 'Redirect to Yandex OAuth' })
  @Redirect()
  yandexRedirect(@Req() req: Request, @Query('state') state?: string) {
    const redirectUri = this.callbackUrlService.getOAuthCallbackUrl('yandex', req);
    let url = this.oauthService.getYandexRedirectUrl(redirectUri);
    if (state) url += `&state=${encodeURIComponent(state)}`;
    return { url, statusCode: 302 };
  }

  @Get('oauth/yandex/callback')
  @ApiOperation({ summary: 'Yandex OAuth callback' })
  async yandexCallback(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) return this.redirectError(res, state, 'Yandex auth cancelled');
    try {
      const redirectUri = this.callbackUrlService.getOAuthCallbackUrl('yandex', req);
      const profile = await this.oauthService.exchangeYandexCode(code, redirectUri);
      const linkResult = await this.identityManagementService.handleOAuthLinkCallback(
        profile,
        state,
      );
      if (linkResult) return this.redirectLinkResult(res, linkResult);
      const { access_token } = await this.authService.loginWithOAuth(profile);
      return this.redirectSuccess(res, state, access_token);
    } catch (e: any) {
      const error = this.authErrorMessage(e);
      this.logger.error(`Yandex callback error: ${error}`);
      return this.redirectCallbackError(res, state, error);
    }
  }

  // ─── VK OAuth ─────────────────────────────────────────────────

  @Get('oauth/vk/redirect')
  @ApiOperation({ summary: 'Redirect to VK OAuth' })
  @Redirect()
  vkRedirect(@Req() req: Request, @Query('state') state?: string) {
    const redirectUri = this.callbackUrlService.getOAuthCallbackUrl('vk', req);
    let url = this.oauthService.getVkRedirectUrl(redirectUri);
    if (state) url += `&state=${encodeURIComponent(state)}`;
    return { url, statusCode: 302 };
  }

  @Get('oauth/vk/callback')
  @ApiOperation({ summary: 'VK OAuth callback' })
  async vkCallback(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) return this.redirectError(res, state, 'VK auth cancelled');
    try {
      const redirectUri = this.callbackUrlService.getOAuthCallbackUrl('vk', req);
      const profile = await this.oauthService.exchangeVkCode(code, redirectUri);
      const linkResult = await this.identityManagementService.handleOAuthLinkCallback(
        profile,
        state,
      );
      if (linkResult) return this.redirectLinkResult(res, linkResult);
      const { access_token } = await this.authService.loginWithOAuth(profile);
      return this.redirectSuccess(res, state, access_token);
    } catch (e: any) {
      const error = this.authErrorMessage(e);
      this.logger.error(`VK callback error: ${error}`);
      return this.redirectCallbackError(res, state, error);
    }
  }

  // ─── Telegram Login Widget ─────────────────────────────────────

  @Post('telegram')
  @ApiOperation({ summary: 'Вход через Telegram Login Widget (POST)' })
  async telegramAuth(@Body() dto: Record<string, string>) {
    if (!dto.hash) throw new BadRequestException('hash required');
    const profile = this.oauthService.verifyTelegramWidget(dto);
    return this.authService.loginWithOAuth(profile);
  }

  @Post('telegram/webapp')
  @ApiOperation({ summary: 'Автоматический вход через Telegram Mini App (initData)' })
  async telegramWebAppAuth(@Body() dto: TelegramWebAppAuthDto) {
    if (!dto.initData) throw new BadRequestException('initData required');
    const profile = this.oauthService.verifyTelegramWebAppInitData(dto.initData);
    const login = await this.authService.loginWithOAuth(profile);
    if (profile.telegramWebAppStartParam?.startsWith('ma_')) {
      try {
        await this.miniAppCapture.enqueueVerifiedMiniAppLaunch({
          userId: login.userId,
          telegramId: profile.providerId,
          startParam: profile.telegramWebAppStartParam,
          sourceEventKey: profile.telegramWebAppEventKey!,
        });
      } catch (error) {
        this.logger.warn(
          `Mini App marketing intent enqueue failed for ${login.userId}: ${this.authErrorMessage(error)}`,
        );
      }
    } else if (profile.telegramWebAppStartParam?.startsWith('ref_')) {
      const referralCode = profile.telegramWebAppStartParam.slice(4).trim();
      if (referralCode) {
        try {
          const referrer = await this.referralsService.registerReferral(
            login.userId,
            referralCode,
            BigInt(profile.providerId),
          );
          if (!referrer) {
            this.logger.warn(
              `Verified Mini App referral was not applied for ${login.userId}: ${referralCode}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Verified Mini App referral registration failed for ${login.userId}: ${this.authErrorMessage(error)}`,
          );
        }
      }
    }
    return login;
  }

  // ─── /auth/me ─────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить текущего пользователя' })
  async getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.id);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private redirectSuccess(res: Response, state: string | undefined, token: string) {
    const frontendUrl = this.callbackUrlService.getFrontendUrl();
    const returnTo = normalizeRelativeReturnTo(state, '/');
    const url = `${frontendUrl}/login/callback?token=${token}&returnTo=${encodeURIComponent(returnTo)}`;
    return res.redirect(302, url);
  }

  private redirectError(res: Response, state: string | undefined, error: string) {
    const frontendUrl = this.callbackUrlService.getFrontendUrl();
    const url = `${frontendUrl}/login?error=${encodeURIComponent(error)}`;
    return res.redirect(302, url);
  }

  private redirectCallbackError(
    res: Response,
    state: string | undefined,
    error: string,
  ) {
    if (this.identityManagementService.isOAuthLinkState(state)) {
      return this.redirectLinkError(res, error);
    }
    return this.redirectError(res, state, error);
  }

  private redirectLinkResult(
    res: Response,
    result: { returnTo: string; status: string },
  ) {
    const frontendUrl = this.callbackUrlService.getFrontendUrl();
    const separator = result.returnTo.includes('?') ? '&' : '?';
    const url = `${frontendUrl}${result.returnTo}${separator}identityLink=${encodeURIComponent(result.status)}`;
    return res.redirect(302, url);
  }

  private redirectLinkError(res: Response, error: string) {
    const frontendUrl = this.callbackUrlService.getFrontendUrl();
    const url = `${frontendUrl}/profile?identityLink=error&identityError=${encodeURIComponent(error)}`;
    return res.redirect(302, url);
  }

  private authErrorMessage(error: any): string {
    const response =
      typeof error?.getResponse === 'function' ? error.getResponse() : null;

    if (response && typeof response === 'object') {
      const body = response as Record<string, unknown>;
      if (typeof body.code === 'string') return body.code;
      if (typeof body.message === 'string') return body.message;
      if (Array.isArray(body.message)) return body.message.join(', ');
    }

    return error?.message || 'Auth failed';
  }
}
