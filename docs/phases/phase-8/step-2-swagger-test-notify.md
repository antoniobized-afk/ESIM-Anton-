# Шаг 2. Swagger и test-notify

> [⬅️ Назад к фазе](../phase-8-api-security-infrastructure.md)

## Цель

Скрыть Swagger UI в production и проверить, что отладочный endpoint `test-notify` закрыт. Если Phase 3 уже закрыла `test-notify`, этот шаг должен только подтвердить guard и не дублировать конфликтующие изменения.

Это отдельный low-risk шаг. Он не должен тянуть за собой другие security refactors и не должен менять business logic.

## Что нужно сделать

### 2.1 Скрыть Swagger в production

- В `backend/src/main.ts`:
  - Обернуть создание Swagger document и `SwaggerModule.setup()` в условие `if (process.env.NODE_ENV !== 'production')`.
  - Не убирать сам Swagger code path полностью: в dev и локальной отладке он остаётся полезным.
  - Если production runtime отличается от локального по `NODE_ENV`, это нужно подтвердить до deploy, иначе Swagger может остаться случайно включённым.

```
До:
  const config = new DocumentBuilder()
    .setTitle('eSIM Service API')
    // ...
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

После:
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('eSIM Service API')
      // ...
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }
```

### 2.2 Защитить `test-notify` endpoint

- В `backend/src/modules/payments/cloudpayments.controller.ts`:
  - Добавить `@UseGuards(JwtAdminGuard)` на метод `testNotify()`.
  - Импортировать `UseGuards` из `@nestjs/common`, `JwtAdminGuard` из `@/common/auth/jwt-user.guard`.
- Если guard уже добавлен в Phase 3, не менять код повторно; только оставить verification.
- Если route уже закрыт guard'ом на уровне контроллера или метода, шаг считается выполненным после подтверждения smoke/test'ом.

### 2.3 Что этот шаг не должен делать

- Не переносить Swagger path.
- Не добавлять Basic Auth в Swagger в рамках этого шага.
- Не трогать остальные debug/admin endpoints, если они уже закрыты Phase 3.
- Не смешивать verification `test-notify` с throttling или DTO changes.

```
@Get('test-notify')
@UseGuards(JwtAdminGuard)
@ApiOperation({ summary: 'Test Telegram notification' })
async testNotify(@Query('telegramId') telegramId: string) { ... }
```

## Результат шага

- Swagger UI недоступен при `NODE_ENV=production`.
- `test-notify` требует admin JWT.
- Dev runtime по-прежнему даёт Swagger UI для локальной диагностики.

## Статус

Не начато

## Журнал изменений

(будет заполнено при реализации)

## Файлы

- `backend/src/main.ts`
- `backend/src/modules/payments/cloudpayments.controller.ts`

## Тестирование / Верификация

- `NODE_ENV=production node dist/main.js` → `GET /api/docs` → 404.
- `NODE_ENV=development npm run start:dev` → `GET /api/docs` → Swagger UI.
- `curl http://localhost:3000/api/payments/cloudpayments/test-notify?telegramId=123` → `401`.
- `curl -H 'Authorization: Bearer <admin_jwt>' 'http://localhost:3000/api/payments/cloudpayments/test-notify?telegramId=123'` → ответ.
- `npm run build` — без ошибок.
- Swagger отсутствие в production проверяется именно по реальному route `/api/docs`, а не только по логам запуска.
