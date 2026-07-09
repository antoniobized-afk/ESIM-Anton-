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

`planned`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.
- Первичный `rg` уже показал, что legacy fields присутствуют в runtime
  consumers; drop нельзя считать безопасным без отдельного pass.

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
