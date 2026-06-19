# Step 01 — Runtime audit и broadcast policy lock

> [Назад к Phase 19](../phase-19-telegram-broadcasts.md)

## Цель

Перед кодом зафиксировать фактический Telegram/bot/notification runtime,
официальные Telegram limits и продуктовую policy: что является маркетинговой
рассылкой, кто имеет право запускать кампании и какие контуры нельзя смешивать.

## Что нужно сделать

- Повторно сверить live code:
  - `bot/src/index.ts`;
  - `bot/src/commands/index.ts`;
  - `bot/src/api.ts`;
  - `backend/src/modules/users/users.controller.ts`;
  - `backend/src/modules/users/users.service.ts`;
  - `backend/src/modules/auth/identity-resolver/*`;
  - `backend/src/modules/telegram/telegram-notification.service.ts`;
  - `backend/src/modules/notifications/traffic-monitor.service.ts`;
  - call sites в `orders`, `payments`, `cloudpayments`, `esim-provider`.
- Сверить Prisma schema:
  - `User.telegramId`;
  - `UserIdentity`;
  - `Notification`;
  - `PushSubscription`;
  - отсутствие Telegram contact/broadcast моделей.
- Подтвердить инфраструктурный baseline:
  - `@nestjs/bullmq`, `bullmq`, `redis` в `backend/package.json`;
  - отсутствие `BullModule`/processors в live code;
  - наличие `ScheduleModule`.
- Сверить официальные Telegram Bot API constraints:
  - private chat rate guidance;
  - bulk notification limit;
  - `429 retry_after`;
  - `sendMessage` text limit;
  - `allow_paid_broadcast` paid mode.
- Зафиксировать policy lock:
  - Phase 19 — marketing/admin broadcast, не transactional notifications;
  - opt-out выключает marketing broadcast;
  - blocked/invalid target исключается из всех future Telegram sends до нового
    подтвержденного contact event;
  - paid broadcast disabled by default;
  - roles: SUPER_ADMIN/MANAGER/SUPPORT.
- Обновить `docs/architecture/telegram-broadcast-runtime.md`, если аудит
  выявит расхождение.

## Результат шага

- Есть проверенный runtime audit.
- Есть финальный policy lock по scope, roles, paid mode и Telegram limits.
- Нет открытых развилок, которые блокируют schema/queue дизайн.

## Зависимости

- Нет.

## Статус

- `planned`

## Журнал изменений

### 2026-06-19

- Шаг создан при проектировании Phase 19.
- Первичный аудит уже подтвердил: Telegram delivery сейчас прямой через
  `axios`, BullMQ не подключен, отдельной broadcast/contact модели нет.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/src/modules/telegram/telegram-notification.service.ts`
- `backend/src/modules/notifications/traffic-monitor.service.ts`
- `backend/src/modules/users/*`
- `backend/src/modules/auth/identity-resolver/*`
- `bot/src/index.ts`
- `bot/src/commands/index.ts`
- `bot/src/api.ts`
- `docs/architecture/telegram-broadcast-runtime.md`
- `docs/phases/phase-19-telegram-broadcasts.md`

## Тестирование / Верификация

- Документированный audit должен ссылаться на live files, а не на память.
- Все Telegram limits должны быть подтверждены official docs.
- `git diff --check`.
