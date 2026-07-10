import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { SharedAuthModule } from './common/auth/auth.shared-module';

// Модули
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { EsimProviderModule } from './modules/esim-provider/esim-provider.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TrafficMonitorModule } from './modules/notifications/traffic-monitor.module';
import { PromoCodesModule } from './modules/promo-codes/promo-codes.module';
import { MarketingAttributionModule } from './modules/marketing-attribution/marketing-attribution.module';

@Module({
  imports: [
    // Конфигурация
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),

    // Планировщик задач (cron jobs)
    ScheduleModule.forRoot(),

    // Rate limiting (глобально: 100 запросов/60 сек на IP)
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // База данных
    PrismaModule,

    // Общий JwtModule + Guard'ы (доступны глобально)
    SharedAuthModule,

    // Бизнес-модули
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    ReferralsModule,
    LoyaltyModule,
    AnalyticsModule,
    EsimProviderModule,
    SystemSettingsModule,
    TelegramModule,
    NotificationsModule,
    TrafficMonitorModule,
    PromoCodesModule,
    MarketingAttributionModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
