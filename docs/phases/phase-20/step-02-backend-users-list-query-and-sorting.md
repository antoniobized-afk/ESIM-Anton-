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
  - Null-политика для `loyaltyLevel`: сортировать пользователей с уровнем по
    естественному rank `LoyaltyLevel.minSpent`, а пользователей без уровня
    (`loyaltyLevelId = null`, UI показывает "Новичок") оставлять в конце списка
    **в обоих направлениях** (asc и desc). Prisma `nulls` поддерживается только
    для optional scalar fields, не для relation field, поэтому backend держит
    контракт через partitioned Prisma queries: сначала users с уровнем
    `orderBy: { loyaltyLevel: { minSpent: order } }`, затем users без уровня.
    Tie-breaker — `id asc`, как в products паттерне.
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
  - Отдельный тест на `loyaltyLevel` relation sort: asc и desc среди
    пользователей с уровнем упорядочены по `minSpent`; пользователи с
    `loyaltyLevelId = null` идут последними в обоих направлениях (не
    переворачиваются на первое место при `desc`).

## Результат шага

- `GET /users` принимает и нормализует `page`, `limit`, `search`, `sortBy`,
  `sortOrder`.
- Default order совместим с текущим поведением: `createdAt DESC`.
- Невалидные sort params не ломают Prisma и возвращают default behavior.
- Search покрывает support-friendly identifiers.
- Нет client-side sort текущей страницы.
- `loyaltyLevel` sort детерминирован: пользователи без уровня всегда в конце
  независимо от direction, покрыто тестом.
- `name` и `telegram` не входят в sort contract; поиск по имени, username,
  email и `telegramId` сохраняется.

## Не входит в scope

- Identity chips и attribution summary.
- Admin UI table rewrite.
- Schema drop legacy identity fields.

## Зависимости

- Step 01.

## Статус

`completed`

## Evidence

- Реализованы `shared/user-sorting.ts`, `backend/src/modules/users/users.sorting.ts`
  и `backend/src/modules/users/dto/users-list-query.dto.ts`.
- `UsersController.findAll()` принимает DTO query, `UsersService.findAll()`
  нормализует `page/limit/search/sortBy/sortOrder`, ищет по `id`,
  `telegramId`, `username`, `email`, `phone`, `firstName`, `lastName` и
  применяет backend sort до pagination.
- Для `telegramId` используется только safe exact BigInt lookup в пределах
  PostgreSQL bigint range; слишком большие numeric search values не передаются
  в BigInt predicate.
- `loyaltyLevel` sort покрыт отдельным service path: users с уровнем сортируются
  по `LoyaltyLevel.minSpent`, users без уровня добираются в конец страницы в
  обоих направлениях без raw SQL.
- Targeted tests:
  `pnpm --filter backend test -- users.service.spec.ts users.controller.spec.ts`
  — green, `22 passed`.
- Type/build gate:
  `pnpm --filter backend exec nest build` — green. Полный
  `pnpm --filter backend build` остановился на known Windows Prisma engine lock:
  `EPERM ... query_engine-windows.dll.node.tmp... -> query_engine-windows.dll.node`.
- Consumer audit:
  `rg -n "usersApi\\.getAll|AdminUser|UserIdentity|authProvider|providerId|sortBy|sortOrder|loyaltyLevel" admin backend client bot shared`
  выполнен; текущие admin `usersApi.getAll` call-sites остаются
  `page/limit/search` до Step 06, product `providerId` hits не относятся к
  legacy user identity cleanup.

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
