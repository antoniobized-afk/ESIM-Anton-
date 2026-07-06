# Engineering Invariants

> [Корневой документ wiki](../README.md)

Цель: registry код-инвариантов и Definition of Done.

## How To Use

- Открывать только релевантные ID через Risk Lookup в [docs/README.md](../README.md), а не читать реестр целиком.
- Доменные контракты живут в профильных docs (`*-runtime.md`, `payment-flow-audit.md`). Здесь только code-level invariants и DoD.
- Status: `auto` — проверяет машина; `manual` — review/grep; `not wired` — правило есть, tooling ещё нет.
- На правила ссылаться по ID; не копировать текст в phase docs, templates или gotchas.

## Registry

| ID | Rule | Status | Open when / reference |
| --- | --- | --- | --- |
| INV-OBS-1 | Перед новым паттерном найти живой reference в соседнем коде и копировать локальный стиль. | manual | Новый service/controller/module/UI pattern. |
| INV-ARCH-1 | Ownership, auth flow, public API, payment/provider flow и deploy contract меняются сначала в профильной wiki или phase doc. | manual | Architecture Gate; [guidelines.md](./guidelines.md). |
| INV-BND-1 | `admin`, `client`, `bot` — разные клиенты над одним backend API; общая бизнес-логика живёт в backend-модуле, а не дублируется по клиентам. | manual | Cross-app behavior; [module-map.md](./module-map.md). |
| INV-DI-1 | Runtime cycle `ProductsModule -> EsimProviderModule -> OrdersModule -> ProductsModule` требует `forwardRef()` на всех сторонах; новые циклы не добавлять. | manual | Nest module imports; [gotchas/product-behavior.md](./gotchas/product-behavior.md). |
| INV-DTO-1 | API boundary не развивать через inline `@Body() dto: any` / inline TS body types: global `ValidationPipe` валидирует только DTO classes. Shared contracts живут в `shared/` (пример: `shared/contracts/checkout.ts`). | manual, not wired | Новые/изменённые endpoints; [gotchas/security.md](./gotchas/security.md). |
| INV-TYPE-1 | Нет нового `: any` / `as any` в `backend/src` и `shared`; внешние JSON (provider, платежи, Telegram) парсить типизированно. | manual, not wired | Boundary parsing / DTO changes. |
| INV-AUTH-1 | Служебные endpoints (`/users/find-or-create`, `/referrals/register`) — только с `x-telegram-bot-token`; user-facing профиль — через `/auth/me` или owner-guarded routes с user JWT; admin JWT — `type: 'admin'`. | manual | Auth/route changes; [gotchas/security.md](./gotchas/security.md), [auth-identity-runtime.md](./auth-identity-runtime.md). |
| INV-SEC-1 | User-controlled redirect (`returnTo` и т.п.) в client проходит через `sanitizeRedirect()` из `client/lib/security.ts`, не напрямую в `router.push/replace`. | manual | Client redirects; [gotchas/security.md](./gotchas/security.md). |
| INV-PRISMA-1 | Schema changes — только через migrations (`prisma migrate`), не `db push`; `prisma migrate deploy` проходит до старта новой версии backend (зашит в `backend` start script). | manual | Любое изменение `schema.prisma`; [gotchas/data-and-migrations.md](./gotchas/data-and-migrations.md). |
| INV-TX-1 | Multi-step mutations — в transaction; уведомления/jobs/external effects — после commit; идемпотентность через durable compare-and-set markers (пример: `Order.completionAccountingAppliedAt`). | manual | Write workflows в orders/payments/loyalty; [gotchas/product-behavior.md](./gotchas/product-behavior.md). |
| INV-CLIENT-1 | Route-level `page.tsx` — тонкий координатор; route-private хуки и компоненты — в `app/<route>/_components`; API/data flow, localStorage и UI-секции не смешивать в одном компоненте (baseline: `client/app/profile/page.tsx`). | manual | Крупные client pages; [guidelines.md](./guidelines.md). |
| INV-CLIENT-2 | `client/app/layout.tsx` остаётся Server Component (экспортирует `metadata`/`viewport`); client-only поведение (Telegram SDK) — в отдельном компоненте, не `'use client'` в root layout. | manual | Root layout / Telegram SDK; [gotchas/product-behavior.md](./gotchas/product-behavior.md). |
| INV-ENV-1 | `.env.example` — живой контракт: новые env keys добавляются туда вместе с кодом; боевые `.env` не читать; env keys из архивных markdown не переносить вслепую. | manual | Config changes; [gotchas/config.md](./gotchas/config.md). |
| INV-SIZE-1 | File budget: >500 строк warning, >800 hard stop, кроме явно объявленного cohesive contract exception. | manual, not wired | Large file edits. |
| INV-SRP-1 | Step/PR не закрывается `completed`, если новый или изменённый файл смешивает независимые responsibilities; split — в этом же шаге, иначе статус `partial`/`blocked`. | manual | Large service/controller/page edits; любой файл за пределами INV-SIZE-1 warning. |
| INV-REUSE-1 | Перед созданием новой util/service/helper проверить существующих owners и call-sites через `rg`; найденный overlap переиспользовать/расширить или явно обосновать нового owner. | manual | New util/service/helper, duplicate-looking код, facade/re-export. |
| INV-SCOPE-1 | Change ровно под задачу; cleanup и попутный рефакторинг — отдельным шагом/коммитом. | manual | Any implementation pass. |
| INV-DOC-1 | Новый backend-модуль -> обновить `module-map.md`; изменение payment/auth/provider flow -> `system-overview.md` и профильный runtime doc; новое расхождение docs/код -> запись в `gotchas/`. Production readiness не документировать без реальной верификации. | manual | Закрытие шага/фичи; [guidelines.md](./guidelines.md). |
| INV-VER-1 | Минимальный gate по типу изменения: backend -> `pnpm --filter backend build` (type gate: `prisma generate && nest build`) + `pnpm --filter backend test` при затронутой логике с тестами; admin -> `pnpm --filter admin lint` + `build`; client -> `pnpm --filter client lint` + `build`; bot -> `pnpm --filter bot build` (tsc). Отдельных `typecheck` скриптов в проекте нет — type gate это build. | auto + manual choice | Verification. |
| INV-VER-2 | Контракт доказан тестом или manual flow, который падает без реализации или явно подтверждает behavior. | manual | Contract-sensitive changes. |
| INV-VER-3 | Infra/harness failure отделён от code defect и не выдаётся за green/red product result (пример: Windows lock на `query_engine-windows.dll.node` при `prisma generate` — среда, не код). | manual | Any failed/noisy gate. |
| INV-VER-4 | Consumer audit после изменения API/service/shared types: grep call-sites по `backend`, `admin`, `client`, `bot`, проверка потребителей `shared/`. | manual | Public or shared contract changes. |

## Definition of Done

Задача, step или PR получает `completed` только если выполнено всё:

1. Минимально достаточный gate (INV-VER-1) зелёный или infra failure явно отделён (INV-VER-3).
2. Manual invariant debt не скрыт: известный SRP/duplicate/file-budget долг исправлен в текущем шаге или статус не `completed`.
3. Для новых util/service/helper выполнен reuse/reference audit (INV-REUSE-1).
4. Контракт доказан (INV-VER-2); consumers обновлены (INV-VER-4).
5. Durable contract changes перенесены в профильный wiki doc или phase doc (INV-DOC-1); changelog туда не льётся.
6. Runtime status честный: `partial` / `baseline` не называются `completed`.

## Enforcement Roadmap

Подключать по одному, каждый отдельным PR с cleanup текущих нарушений.

| ID | Tooling target |
| --- | --- |
| INV-VER-1 | Добавить `typecheck` скрипты (`tsc --noEmit`) во все workspaces и root-агрегатор, чтобы type gate не требовал полного build. |
| INV-TYPE-1 | ESLint `@typescript-eslint/no-explicit-any` на `backend/src/**` и `shared/**`. |
| INV-DTO-1 | ESLint rule/grep-CI против `@Body()` без DTO class в `backend/src/**/controllers`. |
| INV-SIZE-1 | CI script для line count + allowlist declared exceptions. |
| INV-REUSE-1 | Lightweight duplicate/reference scan для новых util/service/helper modules. |
| INV-PRISMA-1 | CI check: изменение `schema.prisma` без нового файла в `prisma/migrations/` — fail. |
