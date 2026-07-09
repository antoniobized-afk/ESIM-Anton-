# Step 01 — Runtime audit и admin users contract lock

> [Назад к Phase 20](../phase-20-admin-users-table-identity-attribution.md)

## Цель

Перед кодом заново подтвердить live users/admin/auth/referral/loyalty runtime и
зафиксировать точный contract таблицы пользователей, чтобы implementation steps
не опирались на устаревший plan или legacy поля.

## Что нужно сделать

- Повторно пройти wiki route:
  - `docs/README.md`;
  - `docs/phases/README.md`;
  - `docs/architecture/module-map.md`;
  - `docs/architecture/auth-identity-runtime.md`;
  - `docs/architecture/loyalty-runtime.md`;
  - `docs/architecture/referrals-runtime.md`;
  - relevant gotchas по security и migrations.
- Сверить live code:
  - `backend/prisma/schema.prisma`;
  - `backend/src/modules/users/users.controller.ts`;
  - `backend/src/modules/users/users.service.ts`;
  - `backend/src/modules/users/user-admin-deletion.service.ts`;
  - `backend/src/modules/users/user-merge-preflight*.ts`;
  - `backend/src/modules/auth/identity-resolver/*`;
  - `backend/src/modules/auth/identity-management/*`;
  - `admin/app/(admin)/users/page.tsx`;
  - `admin/components/Users.tsx`;
  - `admin/components/ui/UserPicker.tsx`;
  - `admin/lib/api.ts`;
  - `admin/lib/types.ts`;
  - `bot/src/index.ts`, `bot/src/commands/index.ts`, `bot/src/api.ts`;
  - client auth/profile types if legacy user fields are touched.
- Выполнить consumer audit:
  - `rg -n "authProvider|providerId|UserIdentity|providerSubject" backend admin client bot shared backend/prisma`;
  - отдельно классифицировать product `providerId` как не относящийся к user
    identity cleanup.
- Зафиксировать итоговый table/read-model contract:
  - scan columns;
  - detail-only fields;
  - sortable keys;
  - search fields;
  - identity safe fields;
  - attribution buckets;
  - admin-only detail boundary.
- Принять gated решение по `User.authProvider/providerId`:
  - какие live consumers нужно заменить;
  - можно ли готовить schema drop в этой фазе;
  - какие production/backfill evidence нужны до drop.
- Обновить Phase 20 status snapshot, если audit меняет scope.

## Результат шага

- Есть подтвержденный runtime audit по live files.
- Есть закрытый contract lock для Step 02-06.
- Нет невыясненных развилок по admin detail endpoint, attribution sort и legacy
  identity cleanup.
- Если обнаружен обязательный runtime dependency на legacy slot, он записан как
  blocker/deprecation path, а не маскируется UI fallback.

## Не входит в scope

- Не писать implementation code.
- Не создавать Prisma migration.
- Не менять admin UI.

## Зависимости

- Нет.

## Статус

`completed`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.
- Первичная сверка уже показала live dependency legacy fields в schema,
  auth resolver/backfill, merge preflight, admin/client types и tests.
- 2026-07-09 повторно пройден wiki route:
  `docs/README.md`, phase roadmap, module map, auth identity runtime, loyalty
  runtime, referral runtime, security gotchas и data/migrations gotchas.
- Live code audit подтвердил baseline:
  - `GET /users` принимает только `page`, `limit`, `search`, возвращает raw
    Prisma users с generic BigInt serializer и сортирует `createdAt DESC`;
  - `admin/components/Users.tsx` читает только `page`, вызывает
    `usersApi.getAll(page, 20)`, показывает legacy `authProvider` и UTM-only
    source;
  - `admin/components/ui/UserPicker.tsx` зависит от positional
    `usersApi.getAll(1, 10, q)`, поэтому Step 02 должен сохранить совместимый
    adapter или мигрировать consumer вместе с API helper;
  - `GET /users/:id` остается mixed admin/user route под
    `OrGuard(JwtAdminGuard, JwtUserGuard)`, поэтому admin diagnostics/detail
    должны идти через admin-only boundary;
  - bot `/start` регистрирует пользователя и обрабатывает только `ref_`
    payload, а UTM в `find-or-create` сейчас не передаются live bot path;
  - client `start_param` уже используется для `ref_` после auth bootstrap,
    поэтому будущий campaign tracking обязан иметь отдельный payload namespace.
- Consumer audit по `authProvider`, `providerId`, `UserIdentity` и
  `providerSubject` подтвердил, что `User.authProvider/providerId` нельзя
  удалять в Step 02/03: они еще
  используются в schema, auth resolver/backfill, merge preflight, admin/client
  types и tests. Product `providerId` hits классифицированы как unrelated.
- Contract lock для Steps 02-06:
  scan columns — `Пользователь`, `Вход`, `Атрибуция`, `Баланс`, `Ценность`,
  `Дата`, `Действия`; detail-only поля — orders/referrals/raw support context;
  sortable keys — `id`, `balance`, `bonusBalance`, `totalSpent`,
  `loyaltyLevel`, `createdAt`; `name` и `telegram` остаются
  display/search-only, потому что это composite/alias значения без простого
  Prisma order key; search — support-friendly scalar identifiers; identity —
  только safe `UserIdentity` summary без
  `providerSubject`/metadata; attribution — `referral`, `utm`,
  `entryChannel`, `unknown`.
- Schema drop legacy identity slots остается gated follow-up: сначала заменить
  live consumers и получить DB/backfill evidence, затем обновить identity wiki
  и только после этого готовить Prisma migration.

## Файлы

- `docs/phases/phase-20-admin-users-table-identity-attribution.md`
- `docs/phases/phase-20/step-01-runtime-audit-and-admin-users-contract-lock.md`
- `docs/architecture/auth-identity-runtime.md`
- `docs/architecture/module-map.md`
- `docs/architecture/loyalty-runtime.md`
- `docs/architecture/referrals-runtime.md`
- `docs/architecture/gotchas/security.md`
- `docs/architecture/gotchas/data-and-migrations.md`

## Тестирование / Верификация

- Manual evidence через wiki/live-code audit.
- `rg` consumer audit по affected terms.
- `git diff --check`.
- Lookup IDs: `INV-OBS-1`, `INV-REUSE-1`, `INV-VER-4`.
