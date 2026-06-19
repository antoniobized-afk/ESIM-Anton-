# Step 04 — BullMQ queue, limiter и worker foundation

> [Назад к Phase 19](../phase-19-telegram-broadcasts.md)

## Цель

Подключить BullMQ/Redis как durable delivery runtime для broadcast recipients с
global limiter, retry/backoff и обработкой Telegram `retry_after`.

## Что нужно сделать

- Подключить `BullModule` в backend:
  - global connection из config;
  - отдельная queue `telegram-broadcast`;
  - fail-fast или disabled mode, если Redis не настроен в production.
- Создать `TelegramBroadcastWorker` / processor:
  - читает recipient job;
  - проверяет campaign state;
  - проверяет contact status и marketing preference;
  - вызывает `TelegramDeliveryClient`;
  - обновляет recipient row и contact state.
- Настроить free-mode limiter:
  - default `25 msg/sec`;
  - конфиг через env/system settings;
  - не использовать paid mode без Step 01 policy.
- Реализовать `429 retry_after`:
  - отложить job на указанное Telegram время;
  - не превращать каждый 429 в terminal failure;
  - не создавать tight retry loop.
- Реализовать retry/backoff для network/5xx/unknown.
- Реализовать idempotency:
  - deterministic job id;
  - row status check до отправки;
  - no duplicate send after `SENT/SKIPPED/FAILED terminal`.
- Добавить pause/cancel safety на уровне worker.

## Результат шага

- Есть работающая очередь и worker foundation для одного recipient job.
- Queue runtime не требует отдельного микросервиса и остается внутри backend
  monolith.
- Worker можно безопасно масштабировать вместе с backend при centralized Redis
  limiter.

## Зависимости

- Step 03.

## Статус

- `planned`

## Журнал изменений

### 2026-06-19

- Шаг создан при проектировании Phase 19.

## Файлы

- `backend/src/app.module.ts`
- `backend/src/modules/telegram-broadcasts/telegram-broadcasts.module.ts`
- `backend/src/modules/telegram-broadcasts/*worker*.ts`
- `backend/src/modules/telegram-broadcasts/*queue*.ts`
- `backend/src/modules/telegram-broadcasts/*processor*.ts`
- `backend/package.json`
- `.env.example`
- `docs/operations/*`, если появляется operator runbook для Redis/queue.

## Тестирование / Верификация

- Unit tests worker state machine:
  - paused campaign;
  - cancelled campaign;
  - already sent recipient;
  - opted-out contact;
  - blocked contact;
  - delivered;
  - rate-limited;
  - transient retry;
  - terminal failure.
- Проверить, что Redis config не читает боевой `.env`.
- `npx tsc --noEmit -p tsconfig.json` в backend.
