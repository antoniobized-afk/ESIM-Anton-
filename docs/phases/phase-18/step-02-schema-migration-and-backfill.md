# Шаг 2. Schema, migration и identity backfill

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Добавить durable `UserIdentity` contract и перенести существующие login lookup
данные в новую модель без удаления legacy fields и без автоматического merge.

## Что нужно сделать

- Добавить Prisma enum/provider contract для `EMAIL`, `TELEGRAM`, `GOOGLE`,
  `YANDEX`, `VK`.
- Добавить модель `UserIdentity` с unique `(provider, providerSubject)` и
  index по `userId`.
- Подготовить migration и Prisma Client refresh.
- Написать backfill path:
  - `User.telegramId` -> `TELEGRAM`;
  - `User.authProvider/providerId` -> соответствующий provider;
  - `User.email` -> email identity или transitional verified-on-next-login
    contract без потери текущего email login behavior.
- Добавить preflight report для конфликтов и невалидных legacy rows.
- Не удалять `User.authProvider`, `User.providerId`, `User.telegramId`,
  `User.email` в этом шаге.

## Результат шага

- БД умеет хранить несколько login identities на одного `User`.
- Существующие пользователи получают identities или explicit conflict report.
- Legacy runtime еще может работать до переключения flows на шаге 3.

## Зависимости

- Шаг 1.

## Статус

`planned`

## Журнал изменений

### 2026-06-06

- Шаг запланирован после policy lock.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/modules/auth/*`
- `backend/src/modules/users/*`
- возможный backfill script/job внутри backend tooling

## Тестирование / Верификация

- `npx prisma migrate dev --name add-user-identities` в локальном dev-контуре.
- `npx prisma generate` или project-approved equivalent после schema change.
- Unit tests на backfill collision handling.
- `npx tsc --noEmit -p tsconfig.json`.
