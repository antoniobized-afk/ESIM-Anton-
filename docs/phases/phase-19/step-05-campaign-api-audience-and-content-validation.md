# Step 05 — Campaign API, audience snapshot и content validation

> [Назад к Phase 19](../phase-19-telegram-broadcasts.md)

## Цель

Добавить backend API и domain services для безопасного управления campaign
lifecycle: draft, preview, schedule/start, pause, resume, cancel, retry failed
и stats.

## Что нужно сделать

- Создать `TelegramBroadcastsController` с `JwtAdminGuard`.
- Добавить DTO classes с `class-validator`:
  - create/update draft;
  - preview;
  - schedule/start;
  - pause/resume/cancel;
  - query/list filters;
  - retry failed.
- Реализовать role policy:
  - `SUPER_ADMIN`: все actions, emergency preview override;
  - `MANAGER`: draft, preview, free-mode schedule/start, pause/resume;
  - `SUPPORT`: read-only.
- Реализовать audience builder:
  - active Telegram contacts;
  - completed orders yes/no;
  - registration date range;
  - completed order country;
  - always exclude blocked/invalid/opted-out.
- Реализовать audience estimate без создания recipient rows.
- Реализовать snapshot:
  - create recipient rows in transaction/batches;
  - snapshot `telegramId`;
  - deterministic unique `(campaignId, userId)`.
- Реализовать content validation:
  - text required, <=4096 after entity policy;
  - `HTML` only;
  - optional one inline button;
  - WebApp URL/path allowlist.
- Реализовать preview send:
  - только на admin/operator Telegram target, если он известен;
  - preview result записывается в campaign/audit;
  - start без preview запрещен, кроме SUPER_ADMIN emergency override.
- Реализовать stats read model:
  - audience;
  - queued/sending/sent/skipped/failed;
  - rate-limited count;
  - last errors.

## Результат шага

- Backend умеет создавать и валидировать campaigns.
- Audience фиксируется через snapshot, а не через live query во время отправки.
- Start не может уйти в массовую отправку с broken content.

## Зависимости

- Step 04.

## Статус

- `planned`

## Журнал изменений

### 2026-06-19

- Шаг создан при проектировании Phase 19.

## Файлы

- `backend/src/modules/telegram-broadcasts/telegram-broadcasts.controller.ts`
- `backend/src/modules/telegram-broadcasts/telegram-broadcasts.service.ts`
- `backend/src/modules/telegram-broadcasts/telegram-broadcast-audience.service.ts`
- `backend/src/modules/telegram-broadcasts/dto/*`
- `backend/src/modules/telegram-broadcasts/*types*.ts`
- `backend/src/modules/telegram-broadcasts/*audit*.ts`

## Тестирование / Верификация

- Controller guard tests.
- DTO validation tests.
- Audience builder tests:
  - active only;
  - opted-out excluded;
  - blocked excluded;
  - completed/no-completed filters;
  - country filter.
- Campaign lifecycle tests:
  - start without preview denied;
  - preview failure blocks start;
  - snapshot idempotency.
- `npx tsc --noEmit -p tsconfig.json` в backend.
