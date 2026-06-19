# Step 07 — Bot opt-out, contact sync и delivery integration

> [Назад к Phase 19](../phase-19-telegram-broadcasts.md)

## Цель

Дать пользователю понятный способ отказаться от маркетинговых рассылок, а
боту — синхронизировать contact state без хранения broadcast logic в bot
runtime.

## Что нужно сделать

- Добавить backend bot-only endpoints с `ServiceTokenGuard`:
  - update Telegram contact profile / last inbound;
  - marketing opt-out;
  - marketing opt-in.
- Встроить contact sync в существующий bot first-contact path:
  - `bot/src/index.ts`;
  - `bot/src/api.ts`;
  - `UsersService.findOrCreate()` или отдельный contact service.
- Добавить bot commands:
  - `/unsubscribe`;
  - `/subscribe`;
  - возможно, короткий пункт в `/help`.
- Команды должны вызывать backend API, а не менять локальную session.
- Если contact `BLOCKED/INVALID`, `/subscribe` не должен вручную делать его
  active без нового inbound update от этого же Telegram user.
- Интегрировать existing transactional `TelegramNotificationService` с новым
  delivery result contract:
  - не ломать service notifications;
  - не смешивать marketing opt-out с critical transactional path;
  - terminal blocked/invalid errors должны обновлять contact status.
- Убрать или документировать любые старые assumptions, где caller считает
  отправку успешной после swallowed exception.

## Результат шага

- Пользователь может отказаться от marketing broadcasts и включить их обратно.
- Inbound bot contact актуализирует `TelegramContact`.
- Broadcast delivery и transactional delivery используют единый error
  classifier/contact-state update.

## Зависимости

- Step 03.
- Step 05.

## Статус

- `planned`

## Журнал изменений

### 2026-06-19

- Шаг создан при проектировании Phase 19.

## Файлы

- `bot/src/index.ts`
- `bot/src/api.ts`
- `bot/src/commands/index.ts`
- `backend/src/modules/telegram/*`
- `backend/src/modules/users/*`
- `backend/src/common/auth/service-token.guard.ts`
- `backend/src/modules/notifications/traffic-monitor.service.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/payments/*`
- `backend/src/modules/esim-provider/esim-webhook.service.ts`

## Тестирование / Верификация

- Bot command tests или focused manual smoke:
  - `/unsubscribe` -> `marketingStatus=OPTED_OUT`;
  - `/subscribe` -> `marketingStatus=ENABLED` для active contact;
  - `/help` показывает команды без лишнего текста.
- Backend tests для ServiceTokenGuard endpoints.
- Existing transactional notification tests обновлены под delivery result.
- Проверить, что opt-out contact не попадает в Step 05 audience.
- `npx tsc --noEmit` в bot и backend.
