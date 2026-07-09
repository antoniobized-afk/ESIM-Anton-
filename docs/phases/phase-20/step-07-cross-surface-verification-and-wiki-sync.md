# Step 07 — Cross-surface verification и wiki sync

> [Назад к Phase 20](../phase-20-admin-users-table-identity-attribution.md)

## Цель

Закрыть фазу только после сквозной проверки backend/admin/client/bot/shared
contracts и синхронизации durable wiki с фактической реализацией.

## Что нужно сделать

- Прогнать backend targeted tests:
  - users sorting/query;
  - read model/serializer;
  - attribution summary;
  - admin-safe detail boundary;
  - identity cleanup specs, если Step 04 менял auth/backfill/merge preflight.
- Прогнать build/lint gates по затронутым workspaces.
- Провести consumer audit по API/types/shared contracts.
- Провести browser smoke через admin `/users`.
- Если была schema migration:
  - проверить Prisma validate/status;
  - зафиксировать production rollout prerequisites;
  - отделить Windows Prisma engine lock от code defect.
- Обновить wiki:
  - `docs/architecture/module-map.md`, если появились новые owners/helpers;
  - `docs/architecture/auth-identity-runtime.md`, если изменился legacy slot
    или admin identity read model;
  - `docs/architecture/loyalty-runtime.md`, только если presentation owner
    влияет на documented admin surfaces;
  - gotchas, если найден новый migration/security риск.
- Обновить phase status/evidence и step evidence.
- При полном closure перенести Phase 20 в `COMPLETED_PHASES.md` и убрать из
  active roadmap.

## Результат шага

- Phase 20 доказана automated gates и manual browser flow.
- Docs отражают фактический target state, а не исходный план.
- Infra/harness failures отделены от product result.
- Нельзя закрыть phase как completed без browser smoke `/users`.

## Не входит в scope

- Реализация новых features после обнаружения unrelated follow-up.
- Data-moving account merge.

## Зависимости

- Steps 01-06.

## Статус

`planned`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.

## Файлы

- `docs/phases/phase-20-admin-users-table-identity-attribution.md`
- `docs/phases/phase-20/*`
- `docs/phases/README.md`
- `docs/phases/COMPLETED_PHASES.md` только при closure
- `docs/architecture/module-map.md`
- `docs/architecture/auth-identity-runtime.md`
- `docs/architecture/loyalty-runtime.md`
- `docs/architecture/gotchas/*`

## Тестирование / Верификация

- Backend:
  - `pnpm --filter backend test -- users.service.spec.ts users.controller.spec.ts`
  - affected identity tests if touched
  - `pnpm --filter backend build`
  - `pnpm --filter backend exec nest build` if Prisma engine lock blocks full
    build
  - `pnpm --filter backend exec prisma validate` if schema touched
- Admin:
  - `pnpm --filter admin lint`
  - `pnpm --filter admin build`
- Client/bot:
  - `pnpm --filter client build` if public auth/profile types changed
  - `pnpm --filter bot build` if bot contract changed
- Consumer audit:
  - `rg -n "usersApi\\.getAll|AdminUser|UserIdentity|authProvider|providerId|sortBy|sortOrder|loyaltyLevel" admin backend client bot shared`
- Browser smoke по `/users`.
- `git diff --check`.
- Lookup IDs: `INV-VER-1`, `INV-VER-2`, `INV-VER-3`, `INV-VER-4`,
  `Definition of Done`.
