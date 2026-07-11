# Step 05 — Order snapshots и referral boundary integration

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Зафиксировать campaign attribution на primary order и связать partner campaign
с existing referral owner, не меняя checkout/reward semantics.

## Что нужно сделать

- Добавить marketing snapshot hook во все primary order creation paths inside
  existing local transaction. Полный inventory до кода: `OrdersService.create`
  создаёт primary PENDING order для card и бесплатного checkout (free затем
  проходит `fulfill-free` без нового order); `OrdersService.createWithBalance`
  создаёт primary PAID order. `createTopupOrder` имеет balance/card ветки, но
  всегда создаёт top-up с `parentOrderId` и явно исключён. `markOrderCompleted`,
  fulfilment и completion-accounting только используют уже созданный snapshot,
  не создают второй. Новые direct `order.create` или новый checkout endpoint
  требуют обновить этот inventory в том же PR.
- До подключения hook сделать `createOrderSnapshot` conflict-safe для
  at-least-once delivery: пустой Prisma `upsert.update: {}` недопустим, потому
  что не доказывает native atomic conflict path. Выбрать один явный write seam
  с atomic conflict handling и readback, затем покрыть два concurrent вызова
  одного `orderId` без `P2002` и без второй строки/snapshot rewrite.
- Top-up paths explicitly skip primary-order snapshot/report semantics.
- При trusted campaign association with `referralLinkId` делегировать
  registration в `ReferralsService`, never write user referral fields directly.
- До этой интеграции сделать consumer audit Telegram identity check в
  `ReferralsService`: подтверждение `telegram subject → userId` строится по
  `UserIdentity(TELEGRAM, providerSubject)`. Не-null `User.telegramId` — только
  contact/drift check; `null` не ломает existing explicit Telegram link. Если
  referral и marketing требуют один и тот же assertion, переиспользовать или
  выделить общий owner, а не копировать legacy-проверку в новом flow.
- Preserve current referral re-attribution rule, auto-promo reservation,
  manual partner-promo precedence and `PartnerRewardsService` idempotency.
- Ensure failed/cancelled/fulfillment/retry paths do not create a new touch,
  second reward or mutable order attribution.

## Результат шага

- Completed revenue/purchase report can join immutable order attribution rather
  than current User last touch.
- Linked campaign may participate in referral registration only through its
  canonical service; all money stays on existing ledger paths.
- Top-up remains outside first/repeat primary and commissionable CPA metrics.

## Зависимости

- Step 02.
- Step 03 или Step 04 для end-to-end capture evidence.

## Статус

`completed`

## Evidence

- Pre-implementation inventory проверен: в `OrdersService` четыре
  `order.create`; два primary пути перечислены выше, два top-up пути исключены.
- `OrdersService.create` (card/free checkout) и `createWithBalance` создают
  immutable marketing snapshot в своей existing local transaction сразу после
  primary order. Оба top-up path остаются без hook; completion/fulfillment не
  переписывают snapshot.
- `MarketingAttributionLifecycleService` использует atomic
  `createMany(skipDuplicates)` и readback по unique `orderId`, а не пустой
  `upsert.update`. DB-backed regression на отдельной локальной PostgreSQL test
  DB синхронизирует две независимые Prisma transaction перед native insert,
  получает один snapshot id/одну строку и после изменения current attribution
  доказывает отсутствие rewrite при повторной доставке. Test запускается только
  с explicit `TEST_DATABASE_URL`.
- Trusted web claim передаёт `referralLinkId` последнего accepted touch из той
  же CTE без N+1 read; Telegram bot/Mini App делегируют linked campaign после
  canonical identity assertion. Marketing не пишет referral fields и не
  создаёт reward ledger.
- `ReferralsService` стал общим owner Telegram assertion:
  `UserIdentity(TELEGRAM, providerSubject)` обязателен, `User.telegramId = null`
  допустим при valid identity, contact drift или другая canonical identity
  отклоняются. Partner/legacy update содержит atomic `orders.none(COMPLETED,
  primary)` guard вместе с existing pre-check.
- Транзитивный `Test.createTestingModule(...).compile()` закрывает DI-regression:
  `ReferralsModule` больше не тянет неиспользуемый `UsersModule`, поэтому цепочка
  `MarketingAttribution -> Referrals -> Users -> Auth -> MarketingAttribution`
  не возникает и `forwardRef()`-shim не нужен.
- Full backend с подключённой isolated test DB: 65 suites / 552 tests прошли;
  `prisma generate --no-engine` + `nest build` зелёные. Обычный engine generate
  локально отдельно блокируется Windows `EPERM` при rename уже загруженного
  `query_engine-windows.dll.node`; это infra lock по `INV-VER-3`, не code defect.

## Файлы

- `backend/src/modules/orders/**`
- `backend/src/modules/referrals/**`
- `backend/src/modules/promo-codes/**`
- `backend/src/modules/marketing-attribution/**`
- `shared/contracts/checkout.ts` only if public shape genuinely changes

## Тестирование / Верификация

- Primary card/balance/free paths create one snapshot; top-up does not;
  completion/retry reads the same snapshot rather than creating another.
- Two concurrent at-least-once calls for one primary `orderId` complete without
  `P2002`, return/read one immutable snapshot and do not rewrite its first/last
  fields; test must exercise the chosen conflict-safe persistence seam rather
  than only mock an empty `upsert.update`.
- Campaign referral registration respects self/legacy/first-completed-order
  guard and cannot generate direct ledger write.
- Linked Telegram account with `User.telegramId = null` passes canonical
  `UserIdentity` assertion; another user’s identity or non-null contact drift
  is rejected without writing referral/reward state.
- Manual partner promo still wins; repeated completion/accounting remains one
  reward per order.
- Lookup: `INV-TX-1`, `INV-PRISMA-1`, `INV-BND-1`, `INV-REUSE-1`,
  `INV-VER-2..4`.
