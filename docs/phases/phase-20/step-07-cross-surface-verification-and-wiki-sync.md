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

`completed`

## Evidence

- Consumer audit по
  `usersApi\.getAll|AdminUser|UserIdentity|authProvider|providerId|sortBy|sortOrder|loyaltyLevel`
  выполнен по `admin backend client bot shared`. Подтверждено:
  admin users API/types не возвращают legacy `authProvider/providerId`,
  product `providerId` hits не относятся к user identity cleanup, schema/auth
  resolver/backfill/merge-preflight legacy hits остаются documented blocker
  path, `usersApi.getAll()` и `usersApi.getById()` используют новый params
  object/admin-only detail boundary.
- Wiki sync выполнен: `docs/architecture/module-map.md` обновлен для
  `users.sorting.ts`, `admin-user-read-model.ts`, `user-profile-read-model.ts`,
  admin `/users`, `shared/user-sorting.ts` и
  `shared/loyalty-level-presentation.ts`. `auth-identity-runtime.md`,
  `loyalty-runtime.md` и migration gotcha уже отражали Step 04/05 target state.
- Backend targeted tests green:
  `pnpm --filter backend test -- users.service.spec.ts users.controller.spec.ts user-profile-read-model.spec.ts user-profile.dto.spec.ts user-merge-preflight.service.spec.ts auth-identity-resolver.service.spec.ts auth-identity-management.service.spec.ts user-identity-backfill.service.spec.ts loyalty-level-presentation.spec.ts`
  — 9 suites / 80 tests passed.
- Backend full build:
  `pnpm --filter backend build` остановился на Windows Prisma engine lock
  `EPERM ... query_engine-windows.dll.node.tmp... -> query_engine-windows.dll.node`;
  это infra failure по `INV-VER-3`. Fallback type gate
  `pnpm --filter backend exec nest build` green.
- Admin gates green: `pnpm --filter admin lint`; `pnpm --filter admin build`.
- Client gates green: `pnpm --filter client build`; `pnpm --filter client lint`
  exit 0 с существующими warnings (`react-hooks/exhaustive-deps`,
  unused `err`). Build также печатает существующий Browserslist/edge runtime
  noise.
- Bot gate: штатный `pnpm --filter bot build` упал на локальный TypeScript
  config mismatch `TS5103 Invalid value for '--ignoreDeprecations'`
  (`bot/tsconfig.json` содержит `ignoreDeprecations: "6.0"`). Fallback
  `pnpm --filter bot exec tsc --ignoreDeprecations 5.0` green; это tooling
  config issue, не Phase 20 regression.
- Browser smoke `/users` выполнен через Playwright + system Chrome against
  fresh local admin dev server `http://localhost:3004` с mocked admin-safe API.
  In-app browser backend был недоступен (`agent.browsers.list() = []`), а
  production `next start` локально не поднялся из-за отсутствующего
  `.next/BUILD_ID` после green build, поэтому smoke выполнен на isolated dev
  server. Проверено:
  invalid `page=-5` и invalid `sortBy=name` канонизируются в
  `/users?search=alisa`; list request уходит как
  `{ page: 1, limit: 20, search: "alisa", sortBy: "createdAt", sortOrder: "desc" }`;
  search `bob@example.com` сбрасывает page; sort `Баланс` отправляет
  `sortBy=balance&sortOrder=desc`; `Вход` показывает `Telegram`/`Google`;
  `Атрибуция` показывает referral + UTM buckets; loyalty badge `Золото`
  рендерится; copy ID пишет полный `User.id`; detail modal ходит только в
  `/api/users/admin/:id`; raw `providerSubject`/`metadata` отсутствуют в DOM;
  modal блокирует body scroll и открывается без scroll jump; viewport 390px не
  дает body horizontal scroll; console errors отсутствуют. Screenshot:
  `output/playwright/phase20-step07-users-smoke.png`. В dev Strict Mode
  detail effect дал 2 identical admin-detail requests; оба через admin-only
  endpoint. Step 06 production-like smoke ранее подтвердил single request path.
- Phase closure выполнен: parent phase doc сжат до completed-summary,
  Phase 20 перенесена в `docs/phases/COMPLETED_PHASES.md` и удалена из active
  `docs/phases/README.md`.

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
