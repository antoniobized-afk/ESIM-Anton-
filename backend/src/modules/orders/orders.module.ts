import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderCompletionAccountingService } from './order-completion-accounting.service';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { EsimProviderModule } from '../esim-provider/esim-provider.module';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';
import { TelegramModule } from '../telegram/telegram.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [
    forwardRef(() => ProductsModule),
    UsersModule,
    forwardRef(() => EsimProviderModule),
    PromoCodesModule,
    TelegramModule,
    SystemSettingsModule,
    ReferralsModule,
    LoyaltyModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderCompletionAccountingService],
  exports: [OrdersService, OrderCompletionAccountingService],
})
export class OrdersModule {}
