# Шаг 4. Rate limiting

> [⬅️ Назад к фазе](../phase-8-api-security-infrastructure.md)

## Цель

Защитить auth endpoints от brute-force и SMS bombing. Исключить webhooks из throttle.

Rate limiting — defense-in-depth, не замена auth/ownership/signature checks. В production нужно учитывать reverse proxy и возможный horizontal scaling.

Это не должен быть "магический security fix". Если topology или IP extraction поняты неверно, throttling либо не защищает, либо режет легитимный трафик.

## Что нужно сделать

### 4.1 Установить @nestjs/throttler

- Выполнить `cd backend && npm install @nestjs/throttler`.

### 4.2 Глобальный throttle

- В `backend/src/app.module.ts`:
  - Импортировать `ThrottlerModule` и `ThrottlerGuard` из `@nestjs/throttler`.
  - Импортировать `APP_GUARD` из `@nestjs/core`.
  - Добавить `ThrottlerModule.forRoot()` в `imports`.
- Добавить `ThrottlerGuard` как глобальный guard через `APP_GUARD`.
- Для production зафиксировать выбранный storage:
  - если Railway backend запускается в одном инстансе — in-memory store допустим как временный control;
  - если инстансов больше одного — использовать Redis-backed throttler storage, иначе лимит обходится распределением запросов между инстансами.
- Проверить client IP extraction за Railway/reverse proxy. Нельзя слепо доверять произвольному `X-Forwarded-For`; trust proxy должен соответствовать deployment topology.
- До внедрения проверить, не существует ли уже глобального `APP_GUARD`, который может конфликтовать по порядку исполнения или ожиданиям тестов.

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,   // 1 минута
      limit: 60,    // 60 запросов в минуту (мягкий глобальный лимит)
    }]),
    // ... остальные imports
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
```

### 4.3 Жёсткие лимиты на auth endpoints

- В `backend/src/modules/auth/auth.controller.ts`:
  - Импортировать `Throttle` из `@nestjs/throttler`.
  - Добавить жёсткие лимиты на:
    - `POST /auth/login` → `@Throttle({ default: { ttl: 60000, limit: 5 } })` (5 попыток в минуту)
    - `POST /auth/phone/send-code` → `@Throttle({ default: { ttl: 60000, limit: 3 } })` (3 SMS в минуту)
- Рассмотреть отдельные named throttles для SMS по phone number, а не только по IP. IP-only лимит слабее против распределённых SMS bombing попыток.
- `verify-code` не обязательно throttle-ить так же жёстко, но решение нужно зафиксировать явно: либо оставить только login/send-code, либо добавить отдельный limit и задокументировать why.

### 4.4 Исключить webhooks из throttle

- В `backend/src/modules/payments/cloudpayments.controller.ts`:
  - Импортировать `SkipThrottle` из `@nestjs/throttler`.
  - Добавить `@SkipThrottle()` **на уровне контроллера**.

```typescript
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('payments/cloudpayments')
export class CloudPaymentsController { ... }
```

- Аналогично для Robokassa webhook handler (если существует отдельный контроллер).
- Проверить `payments.controller.ts` → `POST /payments/webhook` → добавить `@SkipThrottle()` на метод, если есть.
- Не пропускать throttle для `payments/success` и `payments/fail` без необходимости: это browser redirect pages, не provider webhooks.

### 4.5 Operational notes

- Если лимиты вводятся до Redis-backed storage, это нужно явно задокументировать как single-instance mitigation, а не как окончательное production решение.
- После внедрения нужно посмотреть реальные backend logs: виден ли реальный client IP или всё считается по одному proxy IP.
- Если Railway topology позже изменится, throttling нужно пересмотреть в первую очередь.

## Результат шага

- Глобальный rate limit 60 req/min.
- Auth login: 5 попыток в минуту.
- SMS: 3 запроса в минуту.
- Webhooks: без ограничений.
- Production limitation задокументирован: single-instance in-memory или Redis-backed distributed store.
- Легитимные browser/user flows не получают неожиданные `429` в обычном использовании.

## Статус

Не начато

## Журнал изменений

(будет заполнено при реализации)

## Файлы

- `backend/package.json` (новая зависимость `@nestjs/throttler`)
- `backend/src/app.module.ts`
- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/payments/cloudpayments.controller.ts`
- `backend/src/modules/payments/payments.controller.ts` (если есть webhook handler)

## Тестирование / Верификация

- Выполнить 6 последовательных `POST /api/auth/login` за < 60 сек → 6-й запрос → `429 Too Many Requests`.
- Выполнить 4 последовательных `POST /api/auth/phone/send-code` → 4-й → `429`.
- `POST /api/payments/cloudpayments/pay` — 100 запросов подряд → все проходят (SkipThrottle).
- `POST /api/payments/webhook` — Robokassa callback не получает `429` от throttler.
- `GET /api/payments/success` и `GET /api/payments/fail` не помечены `SkipThrottle`, если нет подтверждённой причины.
- `GET /api/products` — 61 запрос за минуту → 61-й → `429` (глобальный лимит).
- Проверить, что разные clients не схлопываются в один proxy IP в логах throttler.
- `npm run build` — без ошибок.
- `npm run test` — все тесты green.
- Manual smoke:
  - обычный admin/client flow не получает `429`;
  - webhook replay test не режется throttler'ом;
  - после рестарта backend лимиты ведут себя ожидаемо для выбранного storage mode.
