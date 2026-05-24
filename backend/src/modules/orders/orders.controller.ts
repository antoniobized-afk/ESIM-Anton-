import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  BadRequestException,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { UsersService } from '../users/users.service';
import { OrderStatus } from '@prisma/client';
import { JwtUserGuard, JwtAdminGuard, CurrentUser, AuthUser } from '@/common/auth/jwt-user.guard';
import { OrGuard } from '@/common/auth/or.guard';
import { CreateOrderQuoteDto } from './dto/create-order-quote.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateTopupOrderDto } from './dto/create-topup-order.dto';
import type {
  CheckoutOrder,
  CreateOrderResponse,
  CreateTopupOrderResponse,
  OrderQuoteResponse,
} from '@shared/contracts/checkout';

const OrdersAccessGuard = OrGuard(JwtAdminGuard, JwtUserGuard);

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
  ) {}

  private toCheckoutOrder(order: any): CheckoutOrder {
    return {
      id: order.id,
      userId: order.userId,
      productId: order.productId,
      status: order.status,
      quantity: Number(order.quantity),
      periodNum: order.periodNum ?? null,
      productPrice: Number(order.productPrice ?? 0),
      discount: Number(order.discount ?? 0),
      promoCode: order.promoCode ?? null,
      promoDiscount: Number(order.promoDiscount ?? 0),
      bonusUsed: Number(order.bonusUsed ?? 0),
      totalAmount: Number(order.totalAmount ?? 0),
      parentOrderId: order.parentOrderId ?? null,
      topupPackageCode: order.topupPackageCode ?? null,
      createdAt: order.createdAt,
      completedAt: order.completedAt ?? null,
    };
  }

  @Get()
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Получить все заказы' })
  async findAll(
    @Query('status') status?: OrderStatus,
    @Query('reconciliation') reconciliation?: 'needs_attention',
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.ordersService.findAll({
      status,
      reconciliation,
      page: +page,
      limit: +limit,
      sortBy,
      sortOrder,
    });
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'Отменить (архивировать) заказ' })
  async cancelOrder(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }

  @Post('quote')
  @UseGuards(JwtUserGuard)
  @ApiOperation({ summary: 'Посчитать актуальную цену заказа без создания order' })
  async quote(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateOrderQuoteDto,
  ): Promise<OrderQuoteResponse> {
    return this.ordersService.previewPricing(user.id, body.productId, {
      quantity: body.quantity,
      useBonuses: body.useBonuses,
      periodNum: body.periodNum,
      promoCode: body.promoCode,
    });
  }

  @Get(':id')
  @UseGuards(OrdersAccessGuard)
  @ApiOperation({ summary: 'Получить заказ по ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.type !== 'admin') {
      await this.ordersService.assertOwnership(id, user.id);
    }
    return this.ordersService.findById(id);
  }

  @Get('user/:userId')
  @UseGuards(OrdersAccessGuard)
  @ApiOperation({ summary: 'Получить заказы пользователя' })
  async findByUser(@Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    if (user.type !== 'admin' && user.id !== userId) {
      throw new ForbiddenException('Доступ к чужим заказам запрещён');
    }
    return this.ordersService.findByUser(userId);
  }

  @Get('user/:userId/check-new')
  @UseGuards(JwtUserGuard)
  @ApiOperation({ summary: 'Проверить новые оплаченные заказы (за последние 10 минут)' })
  async checkNewOrders(@Param('userId') userId: string, @CurrentUser() user: AuthUser) {
    if (user.id !== userId) {
      throw new ForbiddenException('Доступ к чужим заказам запрещён');
    }
    return this.ordersService.checkNewOrders(userId);
  }

  /**
   * Создать заказ.
   *
   * Требует JWT — `userId` берём из токена (body.userId игнорируется,
   * чтобы нельзя было подменить чужого пользователя).
   *
   * При `paymentMethod === 'balance'` — атомарно списываем с баланса и сразу
   * вызываем `fulfillOrder` (eSIM выдаётся синхронно, ответ — `COMPLETED`).
   * При недостатке баланса — `400` с понятным сообщением.
   *
   * Иначе — поведение как раньше: создаём `PENDING`-заказ, фронт открывает
   * CloudPayments-виджет и продолжает через webhooks.
   */
  @Post()
  @UseGuards(JwtUserGuard)
  @ApiOperation({ summary: 'Создать заказ (с баланса или картой)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() createDto: CreateOrderDto,
  ): Promise<CreateOrderResponse> {
    // Синхронно сохраняем email до создания заказа,
    // чтобы fulfillOrder гарантированно видел его при отправке уведомления
    if (createDto.email) {
      await this.usersService.updateEmail(user.id, createDto.email);
    }

    if (createDto.paymentMethod === 'balance') {
      const result = await this.ordersService.createWithBalance(user.id, createDto.productId, {
        quantity: createDto.quantity,
        useBonuses: createDto.useBonuses,
        periodNum: createDto.periodNum,
        promoCode: createDto.promoCode,
      });
      return {
        paymentMethod: result.paymentMethod,
        order: this.toCheckoutOrder(result.order),
      };
    }

    const order = await this.ordersService.create(
      user.id,
      createDto.productId,
      createDto.quantity,
      createDto.useBonuses,
      createDto.periodNum,
      createDto.promoCode,
    );
    return {
      paymentMethod: 'card',
      order: this.toCheckoutOrder(order),
    };
  }

  @Post(':id/fulfill-free')
  @UseGuards(OrdersAccessGuard)
  @ApiOperation({ summary: 'Выполнить бесплатный заказ (промокод 100%)' })
  async fulfillFree(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.type !== 'admin') {
      await this.ordersService.assertOwnership(id, user.id);
    }
    const order = await this.ordersService.findById(id);
    if (!order) throw new BadRequestException('Заказ не найден');
    if (Number(order.totalAmount) > 0) {
      throw new BadRequestException('Заказ не бесплатный');
    }
    await this.ordersService.markOrderPaid(id);
    return this.ordersService.fulfillOrder(id);
  }

  /**
   * Расход трафика по eSIM (с кэшированием).
   * Защищено: только владелец заказа.
   *
   * `?force=true` — принудительно перезапросить у провайдера, минуя кэш.
   */
  @Get(':id/usage')
  @UseGuards(JwtUserGuard)
  @ApiOperation({ summary: 'Расход трафика по eSIM (с кэшированием)' })
  async getUsage(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('force') force?: string,
  ) {
    await this.ordersService.assertOwnership(id, user.id);
    const usage = await this.ordersService.getOrderUsage(
      id,
      undefined,
      force === 'true',
    );

    const toNum = (v: number | null | undefined) =>
      v === null || v === undefined ? null : Number(v);

    return {
      available: usage.available,
      reason: 'reason' in usage ? usage.reason : undefined,
      stale: 'stale' in usage ? usage.stale : false,
      usedBytes: toNum(usage.usedBytes),
      totalBytes: toNum(usage.totalBytes),
      remainingBytes: toNum(usage.remainingBytes),
      updatedAt: usage.updatedAt,
      // Статус и срок жизни для UI: бейдж и второй прогресс-бар
      status: 'status' in usage ? usage.status : null,
      activatedAt: 'activatedAt' in usage ? usage.activatedAt : null,
      expiresAt: 'expiresAt' in usage ? usage.expiresAt : null,
      percentTraffic: 'percentTraffic' in usage ? usage.percentTraffic : null,
      percentTime: 'percentTime' in usage ? usage.percentTime : null,
      validityDaysLeft: 'validityDaysLeft' in usage ? usage.validityDaysLeft : null,
      validityHoursLeft: 'validityHoursLeft' in usage ? usage.validityHoursLeft : null,
    };
  }

  /**
   * Список пакетов пополнения для eSIM (включая цену в RUB).
   * Защищено: только владелец заказа.
   */
  @Get(':id/topup-packages')
  @UseGuards(JwtUserGuard)
  @ApiOperation({ summary: 'Список пакетов пополнения для eSIM (с ценой в RUB)' })
  async getTopupPackages(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.ordersService.assertOwnership(id, user.id);
    return this.ordersService.getTopupPackagesForOrder(id);
  }

  /**
   * Запустить пополнение eSIM выбранным пакетом.
   *
   * Поведение:
   *  - paymentMethod = "balance" (по умолчанию): атомарно списываем с баланса
   *    пользователя и сразу выполняем top-up через провайдера. При ошибке провайдера —
   *    автоматический возврат на баланс.
   *  - paymentMethod = "card": создаётся заказ-пополнение в статусе PENDING и
   *    тут же создаётся платёж через Robokassa. Возвращается paymentUrl.
   *
   * Защищено: только владелец родительского заказа.
   */
  @Post(':id/topup')
  @UseGuards(JwtUserGuard)
  @ApiOperation({ summary: 'Пополнить eSIM (списание с баланса или оплата картой)' })
  async topup(
    @Param('id') parentId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTopupOrderDto,
  ): Promise<CreateTopupOrderResponse> {
    const method = body.paymentMethod === 'balance' ? 'balance' : 'card';

    const result = await this.ordersService.createTopupOrder(
      parentId,
      body.packageCode,
      user.id,
      method,
    );

    // Для card-flow клиент должен сам вызвать POST /payments/create с order.id
    // (это разрывает цикл OrdersModule ↔ PaymentsModule на уровне TS-импортов)
    return {
      paymentMethod: result.paymentMethod,
      order: this.toCheckoutOrder(result.order),
    };
  }
}
