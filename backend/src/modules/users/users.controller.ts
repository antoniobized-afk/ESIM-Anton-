import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthUser, CurrentUser, JwtAdminGuard, JwtUserGuard } from '@/common/auth/jwt-user.guard';
import { OrGuard } from '@/common/auth/or.guard';
import { ServiceTokenGuard } from '@/common/auth/service-token.guard';
import { UsersService } from './users.service';
import { PushService } from '../notifications/push.service';

const UserAccessGuard = OrGuard(JwtAdminGuard, JwtUserGuard);

// Хелпер для сериализации BigInt в JSON
function serializeUser(user: any): any {
  if (!user) return user;
  return JSON.parse(JSON.stringify(user, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly pushService: PushService,
  ) {}

  @Get()
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить список всех пользователей' })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
  ) {
    const result = await this.usersService.findAll(+page, +limit, search);
    return {
      ...result,
      data: result.data.map(serializeUser),
    };
  }

  @Get(':id')
  @UseGuards(UserAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить пользователя по ID' })
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    if (currentUser.type !== 'admin' && currentUser.id !== id) {
      throw new ForbiddenException('Доступ к чужому профилю запрещён');
    }
    const foundUser = await this.usersService.findById(id);
    return serializeUser(foundUser);
  }

  @Get(':id/stats')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить статистику пользователя' })
  async getStats(@Param('id') id: string) {
    const stats = await this.usersService.getUserStats(id);
    return {
      ...stats,
      user: serializeUser(stats.user),
    };
  }

  @Post('find-or-create')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({ summary: 'Найти или создать пользователя (для бота)' })
  async findOrCreate(@Body() dto: {
    telegramId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }) {
    const { telegramId, ...userData } = dto;
    const user = await this.usersService.findOrCreate(
      BigInt(telegramId),
      userData
    );
    return serializeUser(user);
  }

  @Patch('me/email')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Сохранить email текущего пользователя' })
  async updateMyEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: { email: string },
  ) {
    const updated = await this.usersService.updateEmail(user.id, dto.email);
    return serializeUser(updated);
  }

  @Get('push/vapid-public-key')
  @ApiOperation({ summary: 'Получить VAPID публичный ключ для web push' })
  getVapidPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post(':id/push/subscribe')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Подписаться на web push уведомления' })
  async subscribePush(
    @Param('id') userId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: { endpoint: string; p256dh: string; auth: string },
  ) {
    if (user.id !== userId) {
      throw new ForbiddenException('Нельзя подписывать чужой push endpoint');
    }
    await this.pushService.subscribe(userId, dto);
    return { success: true };
  }

  @Delete(':id/push/unsubscribe')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Отписаться от web push уведомлений' })
  async unsubscribePush(
    @Param('id') userId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: { endpoint: string },
  ) {
    if (user.id !== userId) {
      throw new ForbiddenException('Нельзя отписывать чужой push endpoint');
    }
    await this.pushService.unsubscribe(dto.endpoint);
    return { success: true };
  }
}
