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
import { UserAdminDeletionService } from './user-admin-deletion.service';
import { UserMergePreflightService } from './user-merge-preflight.service';
import { FindOrCreateUserDto } from './dto/find-or-create-user.dto';
import { MergePreflightQueryDto } from './dto/merge-preflight.dto';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscription.dto';
import { UpdateMyEmailDto } from './dto/user-profile.dto';
import { UsersListQueryDto } from './dto/users-list-query.dto';
import { toUserProfileReadModel } from './user-profile-read-model';

const UserAccessGuard = OrGuard(JwtAdminGuard, JwtUserGuard);

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly pushService: PushService,
    private readonly adminDeletionService: UserAdminDeletionService,
    private readonly mergePreflightService: UserMergePreflightService,
  ) {}

  @Get()
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить список всех пользователей' })
  async findAll(
    @Query() query: UsersListQueryDto,
  ) {
    // findAll уже отдает admin-safe read model (без legacy slot, telegramId
    // и decimal сериализованы), поэтому дополнительная проекция не нужна.
    return this.usersService.findAll(query);
  }

  @Get('admin/merge-preflight')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read-only preflight для возможного merge пользователей' })
  async mergePreflight(
    @Query() query: MergePreflightQueryDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.mergePreflightService.preflight(
      query.sourceUserId,
      query.targetUserId,
      currentUser,
    );
  }

  @Get('admin/:id')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить admin-safe detail пользователя' })
  async findAdminOne(@Param('id') id: string) {
    return this.usersService.findAdminById(id);
  }

  @Get('push/vapid-public-key')
  @ApiOperation({ summary: 'Получить VAPID публичный ключ для web push' })
  getVapidPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
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
    return toUserProfileReadModel(foundUser);
  }

  @Get(':id/stats')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить статистику пользователя' })
  async getStats(@Param('id') id: string) {
    // getUserStats.user уже приходит через admin-safe read model.
    return this.usersService.getUserStats(id);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удалить пользователя без бизнес-данных' })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    if (currentUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can delete users');
    }

    return this.adminDeletionService.deleteUser(id);
  }

  @Post('find-or-create')
  @UseGuards(ServiceTokenGuard)
  @ApiOperation({ summary: 'Найти или создать пользователя (для бота)' })
  async findOrCreate(@Body() dto: FindOrCreateUserDto) {
    const { telegramId, ...userData } = dto;
    const user = await this.usersService.findOrCreate(
      BigInt(telegramId),
      userData
    );
    return toUserProfileReadModel(user);
  }

  @Patch('me/email')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Сохранить email текущего пользователя' })
  async updateMyEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyEmailDto,
  ) {
    const updated = await this.usersService.updateEmail(user.id, dto.email);
    return toUserProfileReadModel(updated);
  }

  @Post(':id/push/subscribe')
  @UseGuards(JwtUserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Подписаться на web push уведомления' })
  async subscribePush(
    @Param('id') userId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PushSubscribeDto,
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
    @Body() dto: PushUnsubscribeDto,
  ) {
    if (user.id !== userId) {
      throw new ForbiddenException('Нельзя отписывать чужой push endpoint');
    }
    await this.pushService.unsubscribe(dto.endpoint);
    return { success: true };
  }
}
