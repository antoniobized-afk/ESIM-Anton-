# Step 03 — Telegram delivery client и error taxonomy

> [Назад к Phase 19](../phase-19-telegram-broadcasts.md)

## Цель

Вынести Telegram HTTP delivery из "fire and log" паттерна в общий delivery
client, который возвращает typed result, классифицирует ошибки и обновляет
contact state.

## Что нужно сделать

- Создать низкоуровневый `TelegramDeliveryClient` или эквивалент в
  `backend/src/modules/telegram`.
- Ввести typed result:
  - `DELIVERED`;
  - `RATE_LIMITED`;
  - `BLOCKED`;
  - `INVALID_TARGET`;
  - `BAD_REQUEST_CONTENT`;
  - `AUTH_CONFIGURATION`;
  - `TRANSIENT_NETWORK`;
  - `TELEGRAM_5XX`;
  - `UNKNOWN`.
- Извлекать из Telegram error:
  - HTTP status;
  - `error_code`;
  - safe `description`;
  - `parameters.retry_after`;
  - Telegram `message_id` при success.
- Сделать `sendTextNotification` и другие методы
  `TelegramNotificationService` возвращающими delivery result или явно
  документированно бросающими typed exception. Нельзя оставлять swallowed error
  как "успешную" отправку.
- Сохранить текущие transactional call sites без массового переписывания
  бизнес-логики, но убрать недостоверный success marker там, где caller должен
  знать outcome.
- Добавить helpers для content validation:
  - HTML parse mode only;
  - text length <= 4096;
  - safe inline keyboard shape.
- Обновлять `TelegramContact`:
  - `lastDeliveredAt` on success;
  - `BLOCKED/INVALID` on terminal target errors;
  - last safe error fields on failure.

## Результат шага

- Любой Telegram send имеет проверяемый typed outcome.
- Broadcast worker сможет принимать решения по retry/skip/fail без парсинга raw
  axios errors.
- Existing service notifications не помечаются как доставленные при
  фактическом failure.

## Зависимости

- Step 02.

## Статус

- `planned`

## Журнал изменений

### 2026-06-19

- Шаг создан при проектировании Phase 19.
- Primary risk из runtime audit: текущий `sendTextNotification` ловит ошибку и
  не сообщает caller-у о delivery failure.

## Файлы

- `backend/src/modules/telegram/telegram-notification.service.ts`
- `backend/src/modules/telegram/*delivery*.ts`
- `backend/src/modules/telegram/*error*.ts`
- `backend/src/modules/notifications/traffic-monitor.service.ts`
- `backend/src/modules/esim-provider/esim-webhook.service.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/payments/*`

## Тестирование / Верификация

- Unit tests error classifier:
  - success response;
  - `429` с `retry_after`;
  - `403 bot was blocked`;
  - invalid chat / chat not found;
  - bad HTML/content;
  - network timeout;
  - 5xx.
- Targeted tests для call sites, где success marker зависит от delivery
  outcome.
- `npx tsc --noEmit -p tsconfig.json` в backend.
