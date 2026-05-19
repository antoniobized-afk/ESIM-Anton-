# Phase 16: Partner Referral Links

> [Корневой документ wiki](../README.md)

## Цель

Добавить enterprise-контур партнёрских реферальных ссылок для блогеров,
инфлюенсеров и коммерческих партнёров без поломки существующей user-to-user
реферальной системы.

Фаза закрывает полный runtime slice:

- индивидуальные партнёрские условия по ссылке;
- Telegram и Web acquisition paths;
- безопасное автоприменение промокода приглашённому;
- индивидуальный процент referral bonus;
- admin CRUD и аналитика по ссылкам;
- документация runtime-контракта.

## Результат

- В Prisma появляется `ReferralLink` и связанные поля/ledger-связи:
  `User.referralLinkId`, `User.pendingPromoCode`,
  `Transaction.referralLinkId`, `PromoCodeRedemption`,
  `Order.promoCodeSource`.
- `POST /referrals/register` работает как unified lookup:
  сначала `ReferralLink.code`, затем fallback на `User.referralCode`.
- `POST /referrals/register-web` привязывает web-пользователя по partner code через
  `JwtUserGuard`.
- `GET /referrals/links/:code/public` отдаёт минимальную public info для лендинга.
- Referral bonus для покупателя, пришедшего по партнёрской ссылке, считается по
  `ReferralLink.bonusPercent`, а не по глобальному `REFERRAL_BONUS_PERCENT`.
- Auto-promo от партнёрской ссылки применяется только через reservation lifecycle:
  `RESERVED -> CONSUMED/RELEASED`.
- В admin появляется раздел партнёрских ссылок: список, создание/редактирование,
  ссылки Telegram/Web, summary и detail stats.
- Client получает `/ref/[code]` landing и one-shot отправку pending code после auth.
- `docs/architecture/referrals-runtime.md` обновлён как source of truth.

## Оценка

- Размер фазы: `large`
- Ожидаемое число шагов: `6`
- Основные риски:
  - сломать существующий обычный referral flow;
  - получить double-award `REFERRAL_BONUS` при параллельном completion;
  - превысить `PromoCode.maxUses` при параллельных auto-promo reservations;
  - забыть `releaseReservation` в одном из order failure/cancel/stale paths;
  - создать тяжёлую admin stats реализацию с per-link N+1;
  - раскрыть private partner metadata через public endpoint.

## Зависит от

- [Phase 3: Admin Auth & API Security Hardening](./phase-3-admin-auth-and-api-security.md)
- [Phase 4: Loyalty & Referral Wiring](./phase-4-loyalty-and-referral-wiring.md)
- [Phase 6: Admin Orders, Analytics & Reporting](./phase-6-admin-orders-analytics-and-reporting.md)
- [Phase 10: Client Runtime, Payments & Provider Hardening](./phase-10-client-payments-and-provider-hardening.md)
- [Phase 11: Admin Panel Refactoring](./phase-11-admin-panel-refactoring.md)
- [Phase 15: Payment & Webhook Security Hardening](./phase-15-payment-and-webhook-security-hardening.md)
- [Enterprise plan](../plans/Enterprise_Plan.md)
- [Referral runtime wiki](../architecture/referrals-runtime.md)

## Пререквизиты

- Существующая user-to-user referral система работает через:
  - `User.referralCode`;
  - `User.referredById`;
  - `POST /referrals/register` с `ServiceTokenGuard`;
  - `GET /referrals/me` с `JwtUserGuard`;
  - `REFERRAL_BONUS_PERCENT` в `SystemSettings`.
- Purchase completion side effects остаются в `OrdersService.fulfillOrder()` /
  `applyPurchaseCompletionEffects()`.
- Bot уже срезает `/start ref_<code>` prefix и отправляет backend чистый
  `referralCode`.
- Admin auth guards и admin shell уже существуют.
- Client `AuthProvider` уже является единым auth bootstrap layer для web и Telegram
  Mini App.
- До production migration нужно выполнить SQL preflight на дубли
  `REFERRAL_BONUS` по `userId + orderId`.

## Архитектурные решения

- `ReferralLink` добавляет вторую acquisition-сущность, но не заменяет обычный
  `User.referralCode`.
- Lookup order фиксирован:
  1. `ReferralLink.code`;
  2. fallback на `User.referralCode`.
- Если `ReferralLink` найден, но inactive/expired, fallback запрещён.
- `ReferralLink.code` не может совпадать с существующим `User.referralCode`.
- Referral attribution immutable в V1:
  - если `User.referredById` уже заполнен, партнёрская ссылка не меняет
    attribution;
  - `pendingPromoCode` также не выдаётся уже привлечённому пользователю.
- `minPayout` остаётся глобальным в `SystemSettings`; per-link payout threshold не
  входит в V1.
- `Transaction.referralLinkId` является индексируемым source of truth для
  партнёрских referral bonus analytics. JSON metadata не использовать как
  аналитический ключ.
- Partner commission и primary analytics считаются по completed purchase orders
  без `parentOrderId`; top-up остаётся некомиссионным в V1. Если нужен LTV с
  top-up, он показывается отдельной secondary метрикой, не смешанной с
  `commissionableRevenue`.
- Деньги и проценты в backend считать через `Prisma.Decimal`.
- Auto-promo не вызывает существующий `PromoCodesService.use()` на стадии
  `PENDING` order.
- `pendingPromoCode` является first-purchase acquisition discount:
  - manual promo имеет приоритет;
  - первая successful purchase с manual promo очищает partner `pendingPromoCode`;
  - failed/cancelled/stale attempt не очищает pending только фактом неуспешной
    попытки.
- `PromoCodeRedemption` защищает lifecycle:
  - `RESERVED` при создании заказа;
  - `CONSUMED` только после successful completion;
  - `RELEASED` при fail/cancel/stale.
- `PromoCodeRedemptionSource` теперь покрывает и `MANUAL`, и
  `REFERRAL_LINK_AUTO`; manual promo не должен оставаться на отдельном eager
  `usedCount++` path без redemption ledger.
- `reserveForOrder` обязан защищать capacity через row lock / serializable
  transaction. Проверка `usedCount + RESERVED` без lock не считается достаточной.
- Order status side effects не размазывать по прямым `updateStatus()` вызовам:
  добавить `markOrderCompleted`, `markOrderFailed`, `markOrderCancelled` или
  эквивалентные helpers.
- Public endpoint отдаёт только `isValid` и promo code, если он нужен лендингу.
  Не отдавать `userId`, `bonusPercent`, `label`, stats или internal ids.
- Public endpoint стартует с `30 req/min per IP` и
  `Cache-Control: public, max-age=60`; если бизнес требует мгновенного отключения
  ссылок, заменить на `no-store` или `max-age=5`.
- Source of truth при реализации:
  1. код и Prisma schema;
  2. этот phase document;
  3. [Enterprise plan](../plans/Enterprise_Plan.md);
  4. [referrals-runtime.md](../architecture/referrals-runtime.md).

## Шаги (журналы)

1. [Шаг 1. Schema, migration preflight и durable contracts](./phase-16/step-01-schema-migration-and-contracts.md)
2. [Шаг 2. ReferralLink domain и atomic referral registration](./phase-16/step-02-referral-link-domain-and-registration.md)
3. [Шаг 3. Referral bonus award и promo reservation lifecycle](./phase-16/step-03-bonus-award-and-promo-reservation.md)
4. [Шаг 4. Backend API, DTO validation и analytics queries](./phase-16/step-04-backend-api-and-analytics.md)
5. [Шаг 5. Web landing, AuthProvider integration и admin UI](./phase-16/step-05-client-admin-ui.md)
6. [Шаг 6. Verification, rollout docs и runtime wiki](./phase-16/step-06-verification-and-docs.md)

## Верификация

- Legacy referral path:
  - `/start ref_<userReferralCode>` продолжает привязывать `referredById`;
  - обычный referral bonus использует глобальный `REFERRAL_BONUS_PERCENT`;
  - `GET /referrals/me` не ломается.
- Partner referral path:
  - `/start ref_<partnerCode>` привязывает `referredById` и `referralLinkId`;
  - inactive/expired partner code не fallback-ится на обычный user code;
  - self-referral запрещён и для `User.referralCode`, и для `ReferralLink.userId`;
  - пользователь с уже заполненным `referredById` не получает новую attribution и
    `pendingPromoCode` в V1.
- Bonus ledger:
  - `REFERRAL_BONUS` по партнёрской ссылке создаётся с `Transaction.referralLinkId`;
  - два параллельных completion effect не создают два referral bonus по одному
    `userId + orderId`;
  - partial unique index проходит после preflight.
- Promo lifecycle:
  - auto-promo создаёт `PromoCodeRedemption(RESERVED)` без роста `usedCount`;
  - completion переводит reservation в `CONSUMED` и увеличивает `usedCount` один раз;
  - первая successful purchase с manual promo очищает partner `pendingPromoCode`
    без `PromoCodeRedemption`;
  - fail/cancel/stale paths переводят reservation в `RELEASED`;
  - два параллельных order create с `maxUses = 1` не создают две active
    reservations.
- Web flow:
  - `/ref/[code]` сохраняет `pendingReferralCode`;
  - `AuthProvider` отправляет `POST /referrals/register-web` one-shot после auth;
  - web-only и Telegram Mini App auth paths оба покрыты.
- Admin flow:
  - admin создаёт/редактирует партнёрскую ссылку;
  - список отдаёт summary stats без per-link N+1;
  - detail stats показывает registrations, primary purchase orders,
    `commissionableRevenue` и earnings;
  - top-up/LTV revenue, если нужен, показывается отдельной secondary метрикой;
  - sidebar содержит раздел `Партнёрские ссылки`.
- Public endpoint:
  - не раскрывает private partner metadata;
  - имеет rate limit и cache policy.
- Automated baseline:
  - `npx jest src/modules/referrals/ --runInBand`;
  - targeted `orders.service.spec.ts` / `promo-codes.service.spec.ts`;
  - `npx tsc --noEmit -p tsconfig.json` в backend;
  - client/admin typecheck.

## Журнал

### 2026-05-19

- Phase 16 выделена из [Enterprise plan](../plans/Enterprise_Plan.md) как отдельный
  продуктово-архитектурный инкремент.
- Scope признан достаточно крупным для отдельной фазы: затрагиваются Prisma,
  referrals, orders, promo codes, client auth, client route, admin UI, tests и
  architecture wiki.
- Зафиксированы ключевые enterprise guardrails:
  - atomic referral binding;
  - transaction-safe referral bonus award;
  - row-locked auto-promo reservation capacity;
  - centralized order transition helpers для promo release/consume;
  - preflight перед raw partial unique index;
  - immutable attribution для уже привлечённых пользователей.
- **Steps 01–04** (prior session): schema, migrations, domain logic, bonus
  award, promo reservation, backend API, DTO validation, analytics queries.
  29 backend tests, `tsc --noEmit` clean.
- **Step 05** (current session): client landing `/ref/[code]`,
  AuthProvider one-shot referral, admin `ReferralLinks.tsx` (table, create/edit
  modal, stats modal), admin nav item. Client + admin `tsc --noEmit` clean.
- **Step 06** (current session): end-to-end verification (29/29 tests,
  backend/client/admin typecheck clean), `referrals-runtime.md` rewritten as
  source of truth, `module-map.md` updated, `gotchas.md` — stale Prisma Client
  P6001 documented, phase journal finalized.

## Ссылки

- [Корневой документ wiki](../README.md)
- [Project Phases & Roadmap](./README.md)
- [Enterprise plan](../plans/Enterprise_Plan.md)
- [Superseded ReferralLink draft](../plans/ReferralLink.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Loyalty Runtime](../architecture/loyalty-runtime.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Phase Authoring Guide](./PHASE_AUTHORING_GUIDE.md)
