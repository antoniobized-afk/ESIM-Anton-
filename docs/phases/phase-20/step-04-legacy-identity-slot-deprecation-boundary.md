# Step 04 — Legacy identity slot deprecation boundary

> [Назад к Phase 20](../phase-20-admin-users-table-identity-attribution.md)

## Цель

Убрать legacy `User.authProvider/providerId` из admin users surface и принять
безопасное решение по schema/runtime deprecation без слепого drop migration.

## Что нужно сделать

- Провести consumer audit только по legacy user identity fields:
  - `backend/prisma/schema.prisma`;
  - `backend/src/modules/auth/*`;
  - `backend/src/modules/users/*`;
  - `admin/lib/types.ts`;
  - `admin/components/*`;
  - `client/lib/*`;
  - `bot/src/*`;
  - tests and docs.
- Отфильтровать false positives:
  - `EsimProduct.providerId`;
  - OAuth profile local variable `providerId`, если он не читает
    `User.providerId`;
  - product/admin catalog provider ids.
- Удалить legacy fields из admin users list/detail response и admin types.
- Если audit подтверждает, что runtime больше не зависит от legacy slot:
  - заменить remaining live consumers на `UserIdentity`;
  - удалить schema fields и index через Prisma migration;
  - обновить/закрыть Phase 18 backfill script/docs, если они больше не
    применимы;
  - обновить `auth-identity-runtime.md` и migration gotchas.
- Если audit находит обязательные dependencies:
  - оставить schema fields;
  - записать deprecation blocker в Step evidence и auth wiki;
  - не возвращать legacy fields в admin UI как fallback.

## Результат шага

- Admin users UI/API больше не используют legacy slot.
- Есть одно из двух явных решений:
  - schema drop выполнен с migration/backfill evidence;
  - schema drop отложен с зафиксированным blocker и без UI fallback.
- Нельзя закрыть шаг как `completed`, если legacy slot остался в admin
  read model или если drop migration сделана без consumer audit.

## Не входит в scope

- Data-moving account merge.
- Автоматическое объединение пользователей.
- Изменение `EsimProduct.providerId`.

## Зависимости

- Step 01.
- Step 03.

## Статус

`completed`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.
- Первичный `rg` уже показал, что legacy fields присутствуют в runtime
  consumers; drop нельзя считать безопасным без отдельного pass.
- Закрыт 2026-07-09 по blocker-path без schema migration: consumer audit
  `rg -n "authProvider|providerId" backend admin client bot shared backend/prisma`
  подтвердил обязательные dependencies в `AuthIdentityResolverService`
  (legacy exact-provider fallback и запись slot при создании OAuth/email users),
  Phase 18 identity backfill (`user-identity-preflight.service.ts`,
  `user-identity-candidate-builder.service.ts`) и
  `UserMergePreflightService` drift-check.
- False positives отфильтрованы: `EsimProduct.providerId`, product/admin
  catalog provider ids, shared product pricing/sorting и OAuth profile local
  `providerId` не являются legacy `User.providerId`.
- Admin users list/detail read model уже не выбирает и не возвращает
  `User.authProvider/providerId`; `admin/lib/types.ts` содержит только product
  `providerId`.
- Дополнительно очищен profile/user response boundary:
  `/auth/me` больше не выбирает и не возвращает `authProvider`, client
  `AuthUser`/`AppUser` больше не объявляют этот hint.
- Follow-up 2026-07-09 (audit fix): исходный top-level `serializeUser` scrub
  протаскивал legacy slot и финансовые данные чужих пользователей через
  вложенные `referredBy`/`referrals` в `GET /users/:id` и bot `find-or-create`.
  Заменен на whitelist-owner `users/user-profile-read-model.ts`
  (`toUserProfileReadModel`): user-facing responses (`GET /users/:id`,
  `find-or-create`, `PATCH /users/me/email`) отдают только контрактные поля
  клиентского `User` + собственный `loyaltyLevel`. `findById` больше не тянет
  `referredBy/referrals/orders` relation-объекты; `BOT_USER_INCLUDE` очищен от
  мертвого `referredBy`. `serializeUser` удален. Product provider ids не
  затронуты.
- Остаточный boundary вне scope Step 04: `orders.service.findById` включает
  `order.user.referredBy` полным объектом и отдает через `GET /orders/:id`
  (свои потребители — admin/client order detail). Требует отдельного шага с
  собственным consumer audit; чинить вслепую нельзя.
- `AuthIdentityLoginUser` и login snapshot resolver-а больше не выбирают
  `authProvider`; JWT `provider` остается hint от текущего resolver provider,
  а не чтение legacy slot.
- Schema drop отложен до отдельного pass, который сначала уберет/заменит
  resolver fallback/write, закроет Phase 18 backfill dependency и перенесет
  merge-preflight drift-check на `UserIdentity`/новый audit source.
- Verification 2026-07-09:
  `pnpm --filter backend test -- auth.service.spec.ts auth-identity-resolver.service.spec.ts users.controller.spec.ts users.service.spec.ts user-identity-backfill.service.spec.ts user-merge-preflight.service.spec.ts`
  green (6 suites / 55 tests); `pnpm --filter backend build` green;
  `pnpm --filter client build` green; `pnpm --filter client lint` exit 0
  with existing warnings in login/my-esim/AuthProvider; `pnpm --filter admin build`
  green; `git diff --check` green.
- Verification follow-up 2026-07-09 (whitelist read model):
  добавлены `user-profile-read-model.ts` + spec, регрессия на вложенный
  boundary в `users.controller.spec.ts` и include-форму в `users.service.spec.ts`.
  `pnpm --filter backend test -- users.controller.spec.ts users.service.spec.ts user-profile-read-model.spec.ts auth-identity-resolver.service.spec.ts auth.service.spec.ts`
  green (5 suites / 49 tests); `pnpm --filter backend test -- orders payments`
  green (8 suites / 75 tests, подтверждает совместимость shared `findById` с
  order pricing); `pnpm --filter backend build` (type gate) green.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*` если schema drop разрешен
- `backend/src/modules/auth/*`
- `backend/src/modules/users/*`
- `admin/lib/types.ts`
- `client/lib/auth.ts`
- `client/hooks/useUser.ts`
- `docs/architecture/auth-identity-runtime.md`
- `docs/architecture/gotchas/data-and-migrations.md`

## Тестирование / Верификация

- Consumer audit:
  `rg -n "authProvider|providerId" backend admin client bot shared backend/prisma`
- Affected backend identity tests:
  - auth resolver;
  - identity management;
  - identity backfill, if touched;
  - users merge preflight, if touched.
- `pnpm --filter backend exec prisma validate` при schema changes.
- `pnpm --filter backend build` или `pnpm --filter backend exec nest build`
  при Prisma engine lock.
- `pnpm --filter admin build` и client/bot builds if their contracts changed.
- `git diff --check`.
- Lookup IDs: `INV-AUTH-1`, `INV-SEC-1`, `INV-PRISMA-1`, `INV-VER-3`,
  `INV-VER-4`.
