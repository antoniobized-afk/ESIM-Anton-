# Phase 17: Partner Promo Codes

> [Корневой документ wiki](../README.md)

## Цель

Добавить enterprise-контур партнёрских промокодов: промокод остаётся
скидочным инструментом, но может опционально иметь владельца, процент
вознаграждения и формат выплаты. Если владелец не задан, промокод работает как
обычный промокод без referral/partner side effects.

Фаза закрывает отдельный продуктовый slice, не заменяя Phase 16:

- устное и офлайн-распространение кода без ссылки;
- скидка покупателю по существующему promo lifecycle;
- reward владельцу промокода после successful primary purchase;
- режимы выплаты `BALANCE` и `EXTERNAL`;
- защита от double reward, self-reward и финансового drift-а;
- admin CRUD/analytics и runtime wiki для промокодов.

## Результат

- `PromoCode` получает опциональную partner reward policy:
  владелец, процент reward, payout mode.
- Обычные промокоды без владельца продолжают работать без изменений.
- Partner promo code даёт покупателю скидку и после successful primary purchase
  создаёт ровно одно partner reward начисление владельцу.
- Если в одном заказе есть и partner promo code, и referral link attribution,
  reward получает владелец manual partner promo code; referral link reward для
  этого заказа не создаётся.
- Reward policy для конкретного заказа snapshot-ится при reservation/order
  create, чтобы последующие правки промокода в админке не меняли pending или
  исторические заказы.
- `Transaction` ledger получает явный аналитический ключ для reward по
  промокоду, не полагаясь только на JSON metadata.
- Admin `PromoCodes` умеет создавать/редактировать обычные и партнёрские
  промокоды, показывать владельца, payout mode и начисления.
- Документация runtime-контракта промокодов вынесена в wiki и связана с
  `referrals-runtime.md`.

## Оценка

- Размер фазы: `medium-large`
- Ожидаемое число шагов: `6`
- Основные риски:
  - double reward: начислить и по referral link, и по partner promo code;
  - финансовый drift: считать reward по изменённому после создания заказа
    промокоду;
  - перепутать acquisition attribution (`ReferralLink`) и checkout attribution
    (`PromoCode`);
  - сломать обычные промокоды без владельца;
  - обойти `maxUses` при параллельных reservations;
  - начислить reward владельцу за собственную покупку;
  - раздуть admin UI без типизированных DTO и проверяемой статистики.

## Зависит от

- [Phase 4: Loyalty & Referral Wiring](./phase-4-loyalty-and-referral-wiring.md)
- [Phase 6: Admin Orders, Analytics & Reporting](./phase-6-admin-orders-analytics-and-reporting.md)
- [Phase 11: Admin Panel Refactoring](./phase-11-admin-panel-refactoring.md)
- [Phase 15: Payment & Webhook Security Hardening](./phase-15-payment-and-webhook-security-hardening.md)
- [Phase 16: Partner Referral Links](./phase-16-partner-referral-links.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Partner promo code discovery note](../plans/plan_promocodes.md)

## Пререквизиты

- Существующий `PromoCode` runtime подтверждён через:
  - `backend/prisma/schema.prisma`;
  - `backend/src/modules/promo-codes/promo-codes.service.ts`;
  - `backend/src/modules/orders/orders.service.ts`;
  - `backend/src/modules/promo-codes/promo-codes.controller.ts`;
  - `admin/components/PromoCodes.tsx`;
  - `admin/lib/types.ts` и `admin/lib/api.ts`.
- Promo reservations уже существуют через
  `PromoCodeRedemption(RESERVED -> CONSUMED/RELEASED)`.
- Purchase completion side effects остаются в
  `OrdersService.applyPurchaseCompletionEffects()`.
- `ReferralLink` и `Transaction.referralLinkId` из Phase 16 уже реализованы.
- До начала кода нужно подтвердить, что текущая локальная Prisma Client
  сгенерирована после всех Phase 16 migrations.

## Архитектурные решения

- Не объединять `PromoCode` и `ReferralLink` в одну сущность.
  - `ReferralLink` отвечает за acquisition attribution.
  - `PromoCode` отвечает за checkout discount и optional checkout attribution.
- Не создавать отдельную таблицу payout ledger в этой фазе без нового
  финансового требования. Source of truth для начислений остаётся `Transaction`.
- Добавить к `Transaction` nullable `promoCodeId` и relation на `PromoCode` для
  analytics по partner promo rewards.
- `TransactionType.REFERRAL_BONUS` можно использовать как существующий partner
  reward ledger type, но metadata/source обязаны различать
  `referral_link` и `partner_promo_code`. Если при реализации это создаёт
  конфликт с аналитикой, сначала зафиксировать ADR перед добавлением нового enum.
- `PromoCode` получает nullable поля:
  - `referralOwnerId` / relation на `User`;
  - `referralBonusPercent`;
  - `referralPayoutMode` на существующем `ReferralPayoutMode`.
- `PromoCodeRedemption` получает snapshot reward policy:
  - `rewardOwnerIdSnapshot`;
  - `rewardBonusPercentSnapshot`;
  - `rewardPayoutModeSnapshot`;
  - source remains `MANUAL` для введённого вручную partner promo code.
- Snapshot создаётся только в момент reservation/order create. Quote остаётся
  read-only preview и не мутирует БД.
- Один successful primary order может создать максимум один partner reward:
  1. Если order имеет manual partner promo redemption с owner snapshot,
     reward получает владелец промокода.
  2. Иначе применяется существующий referral link / legacy referral reward.
  3. Top-up orders (`parentOrderId IS NOT NULL`) некомиссионные.
- База расчёта reward: фактически оплаченная сумма primary order после promo,
  loyalty discount и bonus spend, то есть `Order.totalAmount`, как в текущем
  referral completion flow. Если бизнес захочет gross revenue, это отдельное
  решение с пересмотром Phase 4/16 формул.
- Self-reward запрещён:
  - владелец partner promo code не должен получать reward за собственный order;
  - предпочтительный вариант V1: partner promo для владельца невалиден на
    checkout, чтобы не было скрытой скидки без reward.
- `BALANCE` увеличивает `bonusBalance` владельца; `EXTERNAL` создаёт только
  `Transaction` для суммы к выплате вне системы.
- Existing `maxUses` / `usedCount` contract сохраняется через row-locked
  `reserveForOrder`; partner reward policy не должна обходить capacity.
- Admin DTO validation обязательна:
  - owner optional;
  - если owner указан, `referralBonusPercent` и `referralPayoutMode`
    обязательны;
  - если owner снят, reward fields очищаются;
  - owner не может быть missing/deleted user.
- Public/client checkout не получает private owner metadata; UI показывает
  только скидку и понятный pricing результат.
- Source of truth при реализации:
  1. код и Prisma schema;
  2. этот phase document;
  3. [referrals-runtime.md](../architecture/referrals-runtime.md);
  4. [payment-flow-audit.md](../architecture/payment-flow-audit.md);
  5. [plan_promocodes.md](../plans/plan_promocodes.md) только как discovery note,
     не как технический контракт.

## Шаги (журналы)

1. [Шаг 1. Runtime audit и policy lock](./phase-17/step-01-runtime-audit-and-policy-lock.md)
2. [Шаг 2. Schema, migrations и snapshot contracts](./phase-17/step-02-schema-migrations-and-snapshots.md)
3. [Шаг 3. Shared partner reward resolver и ledger](./phase-17/step-03-shared-reward-resolver-and-ledger.md)
4. [Шаг 4. Checkout, reservation и completion integration](./phase-17/step-04-checkout-reservation-and-completion.md)
5. [Шаг 5. Admin PromoCodes UI и typed API](./phase-17/step-05-admin-promocodes-ui-and-api.md)
6. [Шаг 6. Analytics, runtime wiki и verification](./phase-17/step-06-analytics-docs-and-verification.md)

## Верификация

- Обычный промокод:
  - создаётся без owner;
  - применяет скидку;
  - создаёт `PromoCodeRedemption`;
  - не создаёт partner reward transaction.
- Partner promo code:
  - создаётся с owner, `referralBonusPercent`, `referralPayoutMode`;
  - preview не мутирует БД;
  - order create создаёт redemption со snapshot reward policy;
  - successful primary completion создаёт ровно один `REFERRAL_BONUS`
    transaction с `promoCodeId`;
  - `BALANCE` увеличивает `bonusBalance`, `EXTERNAL` не увеличивает баланс.
- Attribution precedence:
  - если пользователь пришёл по referral link A, но ввёл partner promo code B,
    reward получает B;
  - если введён обычный promo без owner, reward идёт по existing referral link A;
  - один order не создаёт два partner reward transaction.
- Safety:
  - owner не может получить reward за собственный order;
  - top-up order не создаёт partner reward;
  - failed/cancelled/stale orders release reservation и не создают reward;
  - параллельные reservations не превышают `maxUses`;
  - повторный completion accounting не создаёт duplicate reward.
- Admin:
  - owner picker работает через существующий admin user search pattern;
  - table показывает owner, payout mode и earnings;
  - edit очищает reward fields при снятии owner;
  - DTO/type contracts не используют `any`.
- Automated baseline:
  - `npx jest src/modules/promo-codes/ --runInBand`;
  - targeted `orders.service.spec.ts`;
  - targeted `referrals.service.spec.ts` или новый reward service spec;
  - `npx tsc --noEmit -p tsconfig.json` в backend;
  - `npx tsc --noEmit` в admin;
  - при изменении shared contracts — workspace type-check.

## Журнал

### 2026-05-29

- Phase 17 создана из [plan_promocodes.md](../plans/plan_promocodes.md) после
  проверки текущих Phase 16 referral contracts, Prisma schema, `PromoCodesService`,
  `OrdersService` и admin `PromoCodes`.
- Зафиксирован enterprise-boundary: не объединять `PromoCode` и `ReferralLink`,
  не создавать новый payout ledger без необходимости, не делать MVP-начисление
  через JSON metadata.
- Зафиксированы обязательные финансовые guardrails:
  - one order -> one partner reward;
  - manual partner promo wins over referral link reward;
  - reward policy snapshot на reservation;
  - no self-reward;
  - no top-up commission;
  - balance/external payout через тот же ledger contract.
- Step 1 выполнен: runtime audit подтвердил, что все payment/provider entrypoints
  сходятся в `OrdersService.fulfillOrder()`, promo reservation уже живёт в
  order creation, а consume/release идут через completion/failure boundaries.
  Создана wiki-страница [Promo Codes Runtime](../architecture/promo-codes-runtime.md).
  Блокера для Step 2 нет; schema gaps (`Transaction.promoCodeId`, owner/reward
  fields, redemption snapshots) являются целевым scope следующих шагов.
- Step 2 выполнен: добавлены nullable partner policy поля в `PromoCode`,
  snapshot поля в `PromoCodeRedemption`, `Transaction.promoCodeId`, DTO
  validation и migration
  `20260529163000_add_partner_promo_policy_snapshots`. Reward начисление ещё не
  подключено: выбор partner promo vs referral link остаётся scope Step 3.
- Step 3 выполнен: добавлен общий `PartnerRewardsService`, который владеет
  `BALANCE/EXTERNAL` semantics, order-level idempotency, `referralLinkId` /
  `promoCodeId` ledger keys и `metadata.source`. `ReferralsService` сохранён
  как compatibility wrapper; partner promo reward готов к подключению в
  `OrdersService` на Step 4.
- Step 4 выполнен: checkout self-use guard отклоняет владельца manual partner
  promo до мутаций; internal `validateForReservation()` отдаёт reward policy
  только backend checkout/reservation path, а public validate не раскрывает
  owner metadata. `OrdersService.applyPurchaseCompletionEffects()` сначала
  начисляет manual partner promo reward по snapshot через `PartnerRewardsService`,
  затем fallback-ится в referral link / legacy referral flow. Self-owned
  historical snapshot не создаёт reward и не даёт referral fallback по тому же
  order.
- Step 5 выполнен: admin-facing promo API возвращает owner и
  `totalReferrerEarnings` summary по successful `REFERRAL_BONUS` с
  `promoCodeId`; create/update/toggle response shape выровнен с list. Admin
  `PromoCodes` получил typed Modal create/edit flow с `UserPicker`, payout mode,
  reward percent и clear owner/policy. Delete защищён от потери audit trail:
  промокод с redemptions/transactions/referralLinks можно только отключить.
- Step 6 выполнен: добавлен `GET /promo-codes/:id/stats` и admin stats modal для
  uses, completed primary orders, commissionable revenue, total owner earnings и
  payout mode split. Analytics не опирается на mutable promo policy:
  `commissionableRevenue` считается по completed primary orders через
  `PromoCodeRedemption`, owner earnings — по `Transaction.promoCodeId`, split —
  по `rewardPayoutModeSnapshot`. Runtime wiki и discovery note синхронизированы,
  manual smoke checklist зафиксирован.

## Ссылки

- [Корневой документ wiki](../README.md)
- [Project Phases & Roadmap](./README.md)
- [Phase Authoring Guide](./PHASE_AUTHORING_GUIDE.md)
- [Partner promo code discovery note](../plans/plan_promocodes.md)
- [Phase 16: Partner Referral Links](./phase-16-partner-referral-links.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
