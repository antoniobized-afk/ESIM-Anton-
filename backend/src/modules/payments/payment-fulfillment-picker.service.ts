import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PaymentFulfillmentPickerService {
  private readonly logger = new Logger(PaymentFulfillmentPickerService.name);
  private readonly enabled: boolean;
  private readonly batchSize: number;

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private configService: ConfigService,
  ) {
    this.enabled = this.configService.get('PAYMENT_FULFILLMENT_PICKER_ENABLED') !== 'false';
    this.batchSize = Number(this.configService.get('PAYMENT_FULFILLMENT_PICKER_BATCH_SIZE') ?? 20);
  }

  @Cron('*/10 * * * * *')
  async pickPaidOrders() {
    if (!this.enabled) {
      return;
    }

    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PAID,
      },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize,
      select: { id: true },
    });

    for (const order of orders) {
      try {
        await this.ordersService.fulfillOrder(order.id);
      } catch (error: any) {
        this.logger.warn(
          `Deferred fulfillment for ${order.id} not completed: ${error?.message ?? 'unknown error'}`,
        );
      }
    }
  }
}
