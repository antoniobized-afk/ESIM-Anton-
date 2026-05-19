import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReferralsService } from './referrals.service';
import { AuthUser, CurrentUser, JwtAdminGuard, JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { ServiceTokenGuard } from '@/common/auth/service-token.guard';
import { CreateReferralLinkDto } from './dto/create-referral-link.dto';
import { UpdateReferralLinkDto } from './dto/update-referral-link.dto';
import { ReferralLinksQueryDto } from './dto/referral-links-query.dto';
import { RegisterWebReferralDto } from './dto/register-web-referral.dto';

@ApiTags('referrals')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  // ── Bot registration (ServiceToken) ──────────────────────────────

  @Post('register')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({ summary: 'Зарегистрировать реферала (bot path)' })
  async register(
    @Body() dto: { userId: string; referralCode: string; telegramId: string | number },
  ) {
    const telegramId = BigInt(dto.telegramId);
    return this.referralsService.registerReferral(dto.userId, dto.referralCode, telegramId);
  }

  // ── Web registration (JwtUser) ───────────────────────────────────

  @Post('register-web')
  @UseGuards(JwtUserGuard)
  @ApiOperation({ summary: 'Привязать реферальный код через web (after JWT auth)' })
  async registerWeb(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterWebReferralDto,
  ) {
    return this.referralsService.registerReferral(user.id, dto.referralCode);
  }

  // ── User stats ───────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtUserGuard)
  @ApiOperation({ summary: 'Получить собственную статистику реферальной программы' })
  async getMyStats(@CurrentUser() user: AuthUser) {
    return this.referralsService.getReferralStats(user.id);
  }

  // ── Public endpoint ──────────────────────────────────────────────

  @Get('links/:code/public')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Публичная информация о партнёрской ссылке (без JWT)' })
  async getPublicLinkInfo(@Param('code') code: string) {
    return this.referralsService.getReferralLinkPublicInfo(code);
  }

  // ── Admin: Partner links CRUD ────────────────────────────────────

  @Post('links')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Создать партнёрскую ссылку' })
  async createLink(@Body() dto: CreateReferralLinkDto) {
    return this.referralsService.createReferralLink(dto);
  }

  @Get('links')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Список партнёрских ссылок с summary stats' })
  async getLinks(@Query() query: ReferralLinksQueryDto) {
    return this.referralsService.getReferralLinks(query);
  }

  @Patch('links/:id')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Обновить партнёрскую ссылку' })
  async updateLink(
    @Param('id') id: string,
    @Body() dto: UpdateReferralLinkDto,
  ) {
    return this.referralsService.updateReferralLink(id, dto);
  }

  @Get('links/:id/stats')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Детальная аналитика по партнёрской ссылке' })
  async getLinkStats(@Param('id') id: string) {
    return this.referralsService.getReferralLinkStats(id);
  }

  // ── Admin: User referral stats ───────────────────────────────────

  @Get('stats/:userId')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Получить статистику реферальной программы пользователя' })
  async getStats(@Param('userId') userId: string) {
    return this.referralsService.getReferralStats(userId);
  }

  @Get('top')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Получить топ рефереров' })
  async getTop() {
    return this.referralsService.getTopReferrers();
  }
}
