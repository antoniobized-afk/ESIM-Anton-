# Step 02 — Schema, TelegramContact и campaign ledger

> [Назад к Phase 19](../phase-19-telegram-broadcasts.md)

## Цель

Добавить durable data model для Telegram delivery contacts, broadcast campaigns,
recipient delivery state и operator audit без переноса ownership в
`UserIdentity`.

## Что нужно сделать

- Добавить Prisma enums:
  - `TelegramContactStatus`;
  - `TelegramMarketingStatus`;
  - `TelegramBroadcastStatus`;
  - `TelegramBroadcastRecipientStatus`;
  - `TelegramBroadcastAuditEvent`.
- Добавить `TelegramContact`:
  - `userId`;
  - `telegramId`;
  - delivery status;
  - marketing status;
  - safe profile fields;
  - last inbound/delivered/blocked timestamps;
  - last error code/description;
  - unique indexes по `userId` и `telegramId`.
- Добавить `TelegramBroadcastCampaign`:
  - title/content/button fields;
  - audience filter snapshot;
  - status/timestamps;
  - admin actor fields;
  - rate limit / paid mode snapshots.
- Добавить `TelegramBroadcastRecipient`:
  - campaign/user/contact references;
  - `telegramIdSnapshot`;
  - status, attempts, retry timestamps;
  - sent/error fields;
  - unique `(campaignId, userId)`.
- Добавить `TelegramBroadcastAudit`.
- Создать migration.
- Добавить backfill script/service:
  - читает пользователей с `User.telegramId`;
  - создает `TelegramContact(ACTIVE, ENABLED)`;
  - не создает contact из одного `UserIdentity(TELEGRAM)`, если нет
    доставочного `telegramId`;
  - пишет отчет по skipped/conflict rows.
- Обновить user deletion cleanup, если новые relations блокируют удаление
  пустого duplicate user.

## Результат шага

- База умеет хранить campaigns, recipients, contact status и audit.
- Existing bot users получают `TelegramContact`.
- `UserIdentity` остается login-only моделью.

## Зависимости

- Step 01.

## Статус

- `planned`

## Журнал изменений

### 2026-06-19

- Шаг создан при проектировании Phase 19.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/modules/telegram/*`
- `backend/src/modules/telegram-broadcasts/*`
- `backend/src/modules/users/user-admin-deletion.service.ts`
- `backend/src/scripts/*`
- `docs/architecture/telegram-broadcast-runtime.md`

## Тестирование / Верификация

- `pnpm --filter backend exec prisma validate`
- Unit tests для backfill/preflight:
  - duplicate `telegramId`;
  - user без `telegramId`;
  - existing contact idempotency;
  - `UserIdentity(TELEGRAM)` без contact не становится recipient source.
- Migration rollback note для raw indexes, если они добавляются.
- `git diff --check`.
