# Step 02 — Backend users list query и sorting foundation

> [Назад к Phase 20](../phase-20-admin-users-table-identity-attribution.md)

## Цель

Сделать backend list endpoint честным owner-ом pagination/search/sort contract
для admin users table, без client-side сортировки текущей страницы и без
невалидных query params, попадающих напрямую в Prisma.

## Что нужно сделать

- Добавить users-specific shared sort contract:
  - `shared/user-sorting.ts`;
  - union sortable fields: `id`, `balance`, `bonusBalance`, `totalSpent`,
    `loyaltyLevel`, `createdAt`;
  - default field/order;
  - normalizers для `sortBy`/`sortOrder`.
- Добавить backend mapper:
  - `backend/src/modules/users/users.sorting.ts`;
  - stable Prisma `orderBy` с tie-breakers;
  - relation sort по `loyaltyLevel` только если Prisma mapping покрыт тестом.
- Добавить DTO для list query:
  - `page`;
  - `limit`;
  - `search`;
  - `sortBy`;
  - `sortOrder`.
- Обновить `UsersController.findAll()` так, чтобы query обрабатывался через DTO
  и `ValidationPipe`, а не набор inline `@Query('...')`.
- Обновить `UsersService.findAll()`:
  - нормализовать page/limit;
  - искать по `id`, `telegramId`, `username`, `email`, `phone`, `firstName`,
    `lastName`;
  - для `telegramId` использовать безопасный numeric lookup, не строковый
    contains по BigInt;
  - применять backend sort до pagination;
  - не добавлять sort keys `name` и `telegram`: эти значения остаются
    display/search-only, потому что являются composite/alias (`firstName`,
    `lastName`, `username`, `email`, `telegramId`), а не прямыми stable
    business sort columns;
  - не добавлять `attribution` sort без решения Step 01.
- Добавить unit tests на whitelist/defaults, invalid params, search и stable
  ordering.

## Результат шага

- `GET /users` принимает и нормализует `page`, `limit`, `search`, `sortBy`,
  `sortOrder`.
- Default order совместим с текущим поведением: `createdAt DESC`.
- Невалидные sort params не ломают Prisma и возвращают default behavior.
- Search покрывает support-friendly identifiers.
- Нет client-side sort текущей страницы.
- `name` и `telegram` не входят в sort contract; поиск по имени, username,
  email и `telegramId` сохраняется.

## Не входит в scope

- Identity chips и attribution summary.
- Admin UI table rewrite.
- Schema drop legacy identity fields.

## Зависимости

- Step 01.

## Статус

`planned`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.

## Файлы

- `shared/user-sorting.ts`
- `backend/src/modules/users/users.sorting.ts`
- `backend/src/modules/users/dto/*`
- `backend/src/modules/users/users.controller.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.controller.spec.ts`
- `backend/src/modules/users/users.service.spec.ts`

## Тестирование / Верификация

- `pnpm --filter backend test -- users.service.spec.ts users.controller.spec.ts`
- `pnpm --filter backend build`
- Если `backend build` падает на Windows Prisma engine lock, отдельно:
  `pnpm --filter backend exec nest build`.
- `git diff --check`.
- Lookup IDs: `INV-DTO-1`, `INV-TYPE-1`, `INV-REUSE-1`, `INV-VER-1..4`.
