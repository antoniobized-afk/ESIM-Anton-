import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, CurrentUser, JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { AuthCallbackUrlService } from './auth-callback-url.service';
import {
  SendEmailIdentityLinkCodeDto,
  StartOAuthIdentityLinkDto,
  TelegramWebAppIdentityLinkDto,
  VerifyEmailIdentityLinkDto,
} from './dto/identity-link.dto';
import { EmailCodeService } from './email-code.service';
import { AuthIdentityManagementService } from './identity-management/auth-identity-management.service';
import { isOAuthIdentityLinkProvider } from './identity-management/auth-identity-management.types';
import { OAuthService } from './oauth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthIdentityController {
  constructor(
    private readonly emailCodeService: EmailCodeService,
    private readonly oauthService: OAuthService,
    private readonly identityManagementService: AuthIdentityManagementService,
    private readonly callbackUrlService: AuthCallbackUrlService,
  ) {}

  @Get('identities/me')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить способы входа текущего пользователя' })
  async getMyIdentities(@CurrentUser() user: AuthUser) {
    return this.identityManagementService.listForUser(user.id);
  }

  @Post('identities/link/oauth/:provider/start')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Начать явную привязку OAuth provider' })
  async startOAuthIdentityLink(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Param('provider') provider: string,
    @Body() dto: StartOAuthIdentityLinkDto,
  ) {
    if (!isOAuthIdentityLinkProvider(provider)) {
      throw new BadRequestException('Unsupported OAuth link provider');
    }

    const redirectUri = this.callbackUrlService.getOAuthCallbackUrl(provider, req);
    return this.identityManagementService.startOAuthLink({
      userId: user.id,
      provider,
      redirectUri,
      returnTo: dto.returnTo,
    });
  }

  @Post('identities/link/email/send-code')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отправить код для привязки email identity' })
  async sendEmailIdentityLinkCode(@Body() dto: SendEmailIdentityLinkCodeDto) {
    if (!dto.email) throw new BadRequestException('email required');
    await this.emailCodeService.sendCode(dto.email);
    return { success: true };
  }

  @Post('identities/link/email/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Подтвердить и привязать email identity' })
  async verifyEmailIdentityLink(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyEmailIdentityLinkDto,
  ) {
    if (!dto.email || !dto.code) throw new BadRequestException('email and code required');
    const email = dto.email.trim().toLowerCase();
    const valid = await this.emailCodeService.verifyCode(email, dto.code);
    if (!valid) throw new BadRequestException('Неверный или просроченный код');
    return this.identityManagementService.linkEmail(user.id, email);
  }

  @Post('identities/link/telegram')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Привязать Telegram Login Widget identity' })
  async linkTelegramIdentity(
    @CurrentUser() user: AuthUser,
    @Body() dto: Record<string, string>,
  ) {
    if (!dto.hash) throw new BadRequestException('hash required');
    const profile = this.oauthService.verifyTelegramWidget(dto);
    return this.identityManagementService.linkTelegramProfile(user.id, profile);
  }

  @Post('identities/link/telegram/webapp')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Привязать Telegram Mini App identity' })
  async linkTelegramWebAppIdentity(
    @CurrentUser() user: AuthUser,
    @Body() dto: TelegramWebAppIdentityLinkDto,
  ) {
    if (!dto.initData) throw new BadRequestException('initData required');
    const profile = this.oauthService.verifyTelegramWebAppInitData(dto.initData);
    return this.identityManagementService.linkTelegramProfile(user.id, profile);
  }

  @Delete('identities/:id')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отвязать способ входа текущего пользователя' })
  async unlinkIdentity(@CurrentUser() user: AuthUser, @Param('id') identityId: string) {
    return this.identityManagementService.unlinkIdentity(user.id, identityId);
  }
}
