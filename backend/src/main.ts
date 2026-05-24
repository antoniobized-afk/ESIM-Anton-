// Force rebuild timestamp: 2026-01-14T17:20:00Z
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { FulfillmentExceptionFilter } from '@/common/filters/fulfillment-exception.filter';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // `rawBody: true` — нативный механизм NestJS 10: для каждого запроса
  // буферизует исходное тело и кладёт его в `req.rawBody`. Нужно для
  // HMAC-SHA256-проверки CloudPayments-вебхуков (см. cloudpayments.controller).
  // Не требует прямой зависимости от `express` в package.json — работает
  // через @nestjs/platform-express.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Exception filters
  app.useGlobalFilters(new FulfillmentExceptionFilter());

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Mojo mobile API')
    .setDescription('API для сервиса Mojo mobile')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Аутентификация')
    .addTag('users', 'Пользователи')
    .addTag('products', 'Продукты (тарифы)')
    .addTag('orders', 'Заказы')
    .addTag('payments', 'Платежи')
    .addTag('referrals', 'Реферальная система')
    .addTag('loyalty', 'Программа лояльности')
    .addTag('analytics', 'Аналитика')
    .addTag('system-settings', 'Системные настройки')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
  🚀 Backend API запущен на http://localhost:${port}
  📚 Swagger документация: http://localhost:${port}/api/docs
  `);
}

bootstrap().catch((error) => {
  console.error('❌ Ошибка запуска:', error);
  process.exit(1);
});
