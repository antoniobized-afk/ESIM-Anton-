# Шаг 2. Schema, migration и identity backfill

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Добавить durable `UserIdentity` contract и перенести существующие login lookup
данные в новую модель без удаления legacy fields и без автоматического merge.

## Что нужно сделать

- Добавить Prisma enum/provider contract для `EMAIL`, `TELEGRAM`, `GOOGLE`,
  `YANDEX`, `VK`.
- Не добавлять `PHONE` provider без отдельного подтвержденного phone-login
  runtime: текущий live code хранит `User.phone` как profile/contact field.
- Добавить модель `UserIdentity` с unique `(provider, providerSubject)`,
  unique `(userId, provider)` и index по `userId`.
- Добавить `UserIdentityAudit` или эквивалентную audit table для backfill,
  link/unlink, conflict/preflight и merge decisions.
- Подготовить migration и Prisma Client refresh.
- Написать backfill path:
  - `User.telegramId` -> `TELEGRAM`;
  - `User.authProvider/providerId` -> соответствующий provider;
  - legacy lowercase provider values маппятся явно в enum;
  - `User.email` -> email identity или transitional verified-on-next-login
    contract без потери текущего email login behavior.
- Добавить preflight report для конфликтов и невалидных legacy rows.
- Preflight обязан проверять:
  - duplicate `lower(trim(email))`;
  - duplicate `(authProvider, providerId)`;
  - несколько provider subjects одного provider для одного `User`;
  - `authProvider` без `providerId` и `providerId` без `authProvider`;
  - unknown legacy provider values;
  - bot-only Telegram users с `telegramId`, но без legacy provider slot;
  - расхождения между `telegramId` и legacy telegram `providerId`.
- Backfill должен быть idempotent: повторный запуск не создает дублей и не
  меняет выбранный canonical `User.id`.
- `metadata` в identities/audit не хранит OAuth tokens, raw Telegram `initData`
  или полные provider payloads.
- Не удалять `User.authProvider`, `User.providerId`, `User.telegramId`,
  `User.email` в этом шаге.

## Результат шага

- БД умеет хранить несколько login identities на одного `User`.
- Существующие пользователи получают identities или explicit conflict report.
- История backfill/link/unlink фиксируется в audit trail.
- Legacy runtime еще может работать до переключения flows на шаге 3.
- Добавлен CLI-контур `phase18:identity-backfill`: по умолчанию dry-run,
  запись только через `--apply --confirm-phase18-identity-backfill`.

## Зависимости

- Шаг 1.

## Статус

`implemented-local, pending DB preflight/apply`

## Журнал изменений

### 2026-06-06

- Шаг запланирован после policy lock.

### 2026-06-07

- Добавлены Prisma enum/model:
  - `AuthIdentityProvider`;
  - `UserIdentity`;
  - `UserIdentityAudit`;
  - audit enums для `BACKFILLED`, `LINKED`, `UNLINKED`,
    `LOGIN_CONFLICT`, `MERGE_PREFLIGHT`, `MERGED`.
- Добавлена ручная миграция
  `backend/prisma/migrations/20260607120000_add_user_identities/migration.sql`
  с preflight SQL-комментариями и rollback note. Миграция не переносит данные
  автоматически.
- Добавлен SRP-контур `backend/src/modules/auth/identity-backfill/*` внутри
  `AuthModule`:
  - `UserIdentityCandidateBuilder` строит кандидатов из `User.telegramId`,
    legacy `authProvider/providerId` и `User.email`;
  - `UserIdentityPreflightService` читает БД и собирает read-only conflict
    report;
  - `UserIdentityBackfillApplier` отвечает только за transaction, idempotency
    и audit write;
  - `UserIdentityBackfillService` остается тонким orchestration layer для
    `dry-run/apply`;
  - helper-файлы отдельно держат provider normalization и hash/masked preview.
- Backfill явно маппит legacy providers `email/telegram/google/yandex/vk`, не
  маппит `phone`, блокирует apply при duplicate normalized email, duplicate
  identity subject, duplicate provider per user, incomplete/unknown legacy
  provider, Telegram/email mismatch и existing identity conflict, а bot-only
  Telegram users помечает как неблокирующий info-case.
- Audit `BACKFILLED` пишет только hash/masked provider subject.
- Backfill audit snapshot дополнительно не хранит raw email: только
  `emailHash/emailPreview`, даже если identity candidate содержит email для
  runtime row.
- Добавлен CLI-скрипт
  `backend/src/scripts/phase18-user-identity-backfill.ts`.
- CLI-контракт дополнительно вынесен в
  `backend/src/scripts/phase18-user-identity-backfill-cli.ts`: unknown args не
  игнорируются, `--apply` без `--confirm-phase18-identity-backfill` не
  подключается к БД, а stdout содержит operator report без внутреннего
  candidates/result wrapper.
- Telegram mismatch report больше не возвращает raw `telegramId` в `details`:
  только hash и masked preview.
- Добавлены targeted tests
  `backend/src/modules/auth/identity-backfill/user-identity-backfill.service.spec.ts`
  и `backend/src/scripts/phase18-user-identity-backfill-cli.spec.ts`.
- Важно: runtime login resolver, public auth routes и legacy fields пока не
  переключались. Это задача шага 3.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260607120000_add_user_identities/migration.sql`
- `backend/src/modules/auth/identity-backfill/user-identity-backfill.types.ts`
- `backend/src/modules/auth/identity-backfill/user-identity-normalizer.ts`
- `backend/src/modules/auth/identity-backfill/user-identity-privacy.ts`
- `backend/src/modules/auth/identity-backfill/user-identity-candidate-builder.service.ts`
- `backend/src/modules/auth/identity-backfill/user-identity-preflight.service.ts`
- `backend/src/modules/auth/identity-backfill/user-identity-backfill-applier.service.ts`
- `backend/src/modules/auth/identity-backfill/user-identity-backfill.service.ts`
- `backend/src/modules/auth/identity-backfill/user-identity-backfill.service.spec.ts`
- `backend/src/modules/auth/auth.module.ts`
- `backend/src/scripts/phase18-user-identity-backfill-cli.ts`
- `backend/src/scripts/phase18-user-identity-backfill-cli.spec.ts`
- `backend/src/scripts/phase18-user-identity-backfill.ts`
- `backend/package.json`

## Тестирование / Верификация

- `npx prisma generate` — passed.
- `npx jest modules/auth/identity-backfill/user-identity-backfill.service.spec.ts --runInBand`
  — passed, 8 tests.
- `npx jest modules/auth/identity-backfill/user-identity-backfill.service.spec.ts scripts/phase18-user-identity-backfill-cli.spec.ts --runInBand`
  — passed, 13 tests.
- Backfill tests проверяют, что audit `after` не содержит raw `providerSubject`
  и raw `email`.
- `npx tsc --noEmit -p tsconfig.json` — passed.
- `npm run phase18:identity-backfill -- --apply` — expected guard exit
  `2`: без `--confirm-phase18-identity-backfill` CLI не подключается к БД и не
  выполняет запись.
- `npx prisma validate` — passed.
- `git diff --check` — passed.
- DB migration/backfill на реальной БД еще не запускались. Перед
  `--apply --confirm-phase18-identity-backfill` нужен dry-run/preflight report
  без blocking `error` issues.
