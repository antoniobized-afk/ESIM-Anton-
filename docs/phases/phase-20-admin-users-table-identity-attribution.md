# Phase 20: Admin Users Table Identity & Attribution

> [Корневой документ wiki](../README.md)

## Цель

Сделать `/users` в админке рабочей support-таблицей: администратор должен
быстро понимать, кто пользователь, через какие способы входа он авторизуется,
какая у него атрибуция, финансовая ценность и какие действия безопасно доступны.

Фаза не меняет ownership бизнес-аккаунта: `User.id` остается canonical owner
заказов, платежей, балансов, referral/promo связей и уведомлений.

## Результат

- Backend list contract для `GET /users` получает нормализованные
  `page`, `limit`, `search`, `sortBy`, `sortOrder`; сортировка считается на
  backend до pagination, default остается `createdAt DESC`.
- Admin list response становится явным read model, а не прямым Prisma object:
  decimal/bigint сериализуются контролируемо, identity и attribution поля
  проходят admin-safe serializer.
- Колонка `Провайдер` заменяется на `Вход`: данные берутся из
  `UserIdentity`, без fallback на legacy `User.authProvider/providerId`.
- Колонка `Источник` заменяется на `Атрибуция`: backend summary разделяет
  referral, UTM и entry channel и показывает несколько фактов вместе.
- `Атрибуция` в Phase 20 остается read model над текущими данными. Полноценный
  marketing attribution runtime (`Campaign`, `Touch`, first/last-touch,
  `/go/:code`, tracking endpoint, campaign dashboard, CPA/блогеры) не входит в
  эту фазу и должен идти отдельной фазой после runtime audit.
- Таблица остается scan/action surface: `Пользователь`, `Вход`, `Атрибуция`,
  `Баланс`, `Ценность`, `Дата`, `Действия`; detail-only поля открываются в
  admin-only detail modal.
- Цвета loyalty badges принадлежат одному presentation owner, без нового поля
  `color` в `LoyaltyLevel`.
- Legacy `User.authProvider/providerId` удаляются из admin UI/API surface.
  Schema drop разрешен только после отдельного consumer audit, DB/backfill
  evidence и обновления identity wiki.

## Оценка

- Размер фазы: `large`
- Ожидаемое число шагов: `7`
- Основные риски:
  - legacy `authProvider/providerId` еще используется в auth resolver,
    identity backfill, merge preflight, admin/client types и тестах;
  - admin detail modal нельзя расширять через текущий `GET /users/:id`, потому
    что endpoint доступен и самому пользователю через `JwtUserGuard`;
  - computed attribution не является простым Prisma sort key;
  - предложение по campaign/touch tracking пересекается с referral, promo,
    Telegram start payload и order accounting, поэтому не должно попадать в
    Phase 20 как скрытый pre-work;
  - search/sort не должны сортировать только текущую страницу;
  - `providerSubject`, raw metadata и OAuth/Telegram payload нельзя отдавать в
    admin list/detail response;
  - `Users.tsx` уже близок к границе, поэтому cells/toolbar/modal нельзя
    закрывать как монолитный page component;
  - migration drop legacy fields нельзя делать до production backfill evidence.

## Зависит от

- [Phase 11: Admin Panel Refactoring](./phase-11-admin-panel-refactoring.md)
- [Phase 16: Partner Referral Links](./phase-16-partner-referral-links.md)
- [Phase 17: Partner Promo Codes](./phase-17-partner-promo-codes.md)
- [Phase 18: Account Identity Linking & Merge](./phase-18-account-identity-linking-and-merge.md)
- [Module Map](../architecture/module-map.md)
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md)
- [Loyalty Runtime](../architecture/loyalty-runtime.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Security Gotchas](../architecture/gotchas/security.md)
- [Data and Migrations Gotchas](../architecture/gotchas/data-and-migrations.md)

## Пререквизиты

- `UserIdentity` и `UserIdentityAudit` уже есть в Prisma schema.
- `POST /users/find-or-create` остается bot-only route под
  `ServiceTokenGuard`.
- `DELETE /users/admin/:id` уже принадлежит `UserAdminDeletionService` и
  блокирует удаление пользователей с business rows.
- Admin UI уже имеет reusable primitives `Table`, `SortableHeader`, `Modal`,
  `ConfirmDialog`, `Pagination`, `Toast`.
- Живые reference для URL-state sorting: `admin/components/Orders.tsx` и
  `admin/components/products/useProductFilters.ts`.
- Bot `/start` регистрирует Telegram user и referral payload отдельными
  вызовами; UTM из bot middleware сейчас не передаются.
- `GET /users/:id` является mixed admin/user endpoint; admin detail read model
  должен жить за admin-only boundary или явно ветвить ответ по actor type.

## Архитектурные решения

- `UserIdentity` — единственный source of truth для способов входа в admin
  users UI. Legacy `User.authProvider/providerId` нельзя заполнять задним
  числом ради таблицы и нельзя использовать как diagnostic fallback.
- Schema drop legacy fields не является предусловием для улучшения таблицы.
  Если Step 01/04 находят live runtime dependency, поля остаются в schema, но
  admin list/detail не читает их и wiki фиксирует deprecation blocker.
- Users sort contract делается точечно: `shared/user-sorting.ts` для union,
  defaults и normalizers, `backend/src/modules/users/users.sorting.ts` для
  Prisma `orderBy`. Не создавать generic table sorting framework.
- Default sort whitelist: `id`, `balance`, `bonusBalance`, `totalSpent`,
  `loyaltyLevel`, `createdAt`. `name`, `telegram` и `attribution` не становятся
  sortable keys без отдельного backend-owned rank contract; не вводить raw SQL
  или persisted sort column только ради косметического header sort.
- Search ищет по support-friendly scalar fields: `id`, `telegramId` для
  numeric exact lookup, `username`, `email`, `phone`, `firstName`,
  `lastName`. OAuth `providerSubject` не участвует в поиске и не отдается в UI.
- `Атрибуция` строится на backend и не смешивает независимые факты:
  `referral`, `utm`, `entryChannel`, `unknown`. Если есть referral и UTM,
  response показывает оба bucket.
- Phase 20 не добавляет placeholder-поля под будущий `Campaign/Touch`
  контракт. Если последующая фаза создаст marketing attribution owner, она
  может заменить источник данных внутри `attributionSummary`, но не должна
  ломать admin users UI contract.
- Предложение из `docs/work/session.md` по UTM/campaign tracking является
  supporting input для будущего аудита, не source of truth. Перед Phase 21
  нужно отдельно проверить `ReferralLink`, `PromoCode`, `PromoCodeRedemption`,
  `Transaction`, order completion accounting, Telegram `start/startapp`
  semantics и web referral bootstrap.
- Detail modal использует existing `Modal`, но data boundary admin-only. Не
  расширять mixed `GET /users/:id` admin diagnostics без защиты от user access.
- Provider labels не маппить третьей локальной картой в admin. Backend response
  должен отдавать label или шаг должен вынести маленький shared/backend owner
  после `INV-REUSE-1` audit.
- Loyalty colors — presentation policy, не runtime pricing contract. Не
  добавлять `LoyaltyLevel.color` без отдельного требования на ручную настройку.

Использованные lookup IDs: `INV-OBS-1`, `INV-DTO-1`, `INV-TYPE-1`,
`INV-AUTH-1`, `INV-SEC-1`, `INV-SIZE-1`, `INV-SRP-1`, `INV-REUSE-1`,
`INV-VER-1..4`.

## Шаги

1. [Step 01 — Runtime audit и admin users contract lock](./phase-20/step-01-runtime-audit-and-admin-users-contract-lock.md)
2. [Step 02 — Backend users list query и sorting foundation](./phase-20/step-02-backend-users-list-query-and-sorting.md)
3. [Step 03 — Admin-safe user read model и attribution summary](./phase-20/step-03-admin-safe-user-read-model-and-attribution.md)
4. [Step 04 — Legacy identity slot deprecation boundary](./phase-20/step-04-legacy-identity-slot-deprecation-boundary.md)
5. [Step 05 — Loyalty level presentation owner](./phase-20/step-05-loyalty-level-presentation-owner.md)
6. [Step 06 — Admin users table, toolbar и detail modal](./phase-20/step-06-admin-users-table-toolbar-and-detail-modal.md)
7. [Step 07 — Cross-surface verification и wiki sync](./phase-20/step-07-cross-surface-verification-and-wiki-sync.md)

## Execution topology

Рабочее правило:

- Одна сессия выполняет один step, обновляет step evidence и phase status
  snapshot.

Порядок:

- Step 01 -> Step 02 -> Step 03.
- Step 04 стартует после Step 01 и Step 03, потому что deprecation зависит от
  фактических consumers и нового admin read model.
- Step 05 можно выполнять после Step 01 независимо от backend sorting.
- Step 06 стартует после Step 02, Step 03 и Step 05.
- Step 07 закрывает фазу после всех implementation steps.

## Верификация

- Backend targeted tests:
  - `pnpm --filter backend test -- users.service.spec.ts users.controller.spec.ts`;
  - новые specs для users sorting/read-model/attribution;
  - affected identity specs, если Step 04 меняет auth/backfill/merge preflight.
- Backend build/type gate:
  - `pnpm --filter backend build`;
  - если Windows Prisma engine lock дает `EPERM` на
    `query_engine-windows.dll.node`, отделить как infra failure и дополнительно
    выполнить `pnpm --filter backend exec nest build`.
- Prisma gates при schema/migration changes:
  - `pnpm --filter backend exec prisma validate`;
  - `pnpm --filter backend exec prisma migrate status` на rollout environment
    перед deploy.
- Admin gates:
  - `pnpm --filter admin lint`;
  - `pnpm --filter admin build`.
- Client/bot gates только при затрагивании их contracts:
  - `pnpm --filter client build`;
  - `pnpm --filter bot build`.
- Consumer audit:
  - `rg -n "usersApi\\.getAll|AdminUser|UserIdentity|authProvider|providerId|sortBy|sortOrder|loyaltyLevel" admin backend client bot shared`.
  - Product `providerId` hits не относятся к legacy user identity cleanup и
    должны быть явно отфильтрованы.
- Manual/browser smoke:
  - `/users?page=-5` нормализуется в валидный URL/state;
  - search по email/username/id/telegram сбрасывает page;
  - сортировка `Баланс`, `Ценность`, `Дата` меняет URL и backend request;
  - `Вход` показывает `UserIdentity` chips у Telegram/OAuth/email users без
    чтения legacy `authProvider`;
  - `Атрибуция` показывает referral и UTM вместе, если оба факта есть;
  - empty attribution state не выглядит как ошибка данных;
  - detail modal открывается только через admin-safe boundary и не показывает
    raw `providerSubject`/metadata;
  - copy full `User.id` работает;
  - delete flow для `SUPER_ADMIN` сохраняет backend blockers;
  - desktop и narrow viewport не ломают таблицу, текст не пересекается.

## Связанные документы

- [Входной план](../plans/admin-users-table-improvements-plan.md) — supporting
  input, не source of truth после создания Phase 20.
- `docs/work/session.md` — supporting proposal по UTM/campaign tracking; читать
  только как вход для будущего Phase 21 audit, не как контракт Phase 20.
- [Module Map](../architecture/module-map.md) — ownership users/admin/shared.
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md) — граница
  `User` vs `UserIdentity` и deprecation legacy slot.
- [Loyalty Runtime](../architecture/loyalty-runtime.md) — смысл loyalty levels,
  где presentation не должен менять pricing runtime.
- [Referral Runtime](../architecture/referrals-runtime.md) — referral attribution
  и partner link policy.
- [Security Gotchas](../architecture/gotchas/security.md) — identity security,
  bot-only routes, DTO/link-state notes.
- [Data and Migrations Gotchas](../architecture/gotchas/data-and-migrations.md)
  — migration/backfill порядок и Prisma Windows lock.

## Статус / Evidence

- Status: `planned`
- Current step: Step 02
- Last evidence:
  - Phase создана после сверки `docs/README.md`,
    `docs/phases/PHASE_AUTHORING_GUIDE.md`, phase roadmap, architecture wiki,
    исходного plan и live code в `backend`, `admin`, `client`, `bot`, `shared`,
    `backend/prisma/schema.prisma`.
  - Подтверждено, что исходный plan требует phase package: backend API/list
    contract, identity/attribution read model, admin UI, gated migration/wiki
    work.
  - Подтверждены корректировки к plan: admin detail must be admin-only,
    attribution sorting не обещается без rank owner, legacy schema drop gated.
  - Предложение по `Campaign/Touch` из `docs/work/session.md` разведено с Phase
    20: текущая фаза фиксирует admin users `attributionSummary`, а полноценный
    marketing attribution runtime идет только после отдельного audit и новой
    phase package.
  - Step 01 закрыт 2026-07-09: повторный wiki/live-code audit подтвердил
    текущий users/admin/auth/referral/loyalty baseline, mixed user/admin
    endpoint `GET /users/:id`, отсутствие sort/search DTO в users list,
    legacy `authProvider/providerId` dependencies и отдельный future scope для
    campaign/touch tracking.
