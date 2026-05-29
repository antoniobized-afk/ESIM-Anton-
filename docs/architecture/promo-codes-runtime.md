# Promo Codes Runtime

> [Корневой документ wiki](../README.md)

> Актуальный runtime-контракт промокодов перед Phase 17 Partner Promo Codes.
> Source of truth — код и Prisma schema, затем этот документ.

## Scope

Документ фиксирует текущий baseline:

- обычные промокоды checkout discount;
- manual и referral-link auto promo reservation lifecycle;
- точки создания/consume/release `PromoCodeRedemption`;
- границы order completion, где Phase 17 должна добавить partner reward;
- financial policy для партнёрских промокодов до schema/code изменений.

## Source Of Truth

- `backend/prisma/schema.prisma`
- `backend/src/modules/promo-codes/promo-codes.service.ts`
- `backend/src/modules/promo-codes/promo-codes.controller.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/orders/orders.controller.ts`
- `backend/src/modules/referrals/referrals.service.ts`
- `backend/src/modules/payments/cloudpayments.service.ts`
- `backend/src/modules/payments/payments.service.ts`
- `admin/components/PromoCodes.tsx`
- `admin/lib/api.ts`
- `admin/lib/types.ts`
- [Referral Runtime](./referrals-runtime.md)
- [Payment Flow Audit](./payment-flow-audit.md)

## Current Prisma Contracts

### PromoCode

`PromoCode` является discount/capacity сущностью с optional partner reward
policy:

```prisma
PromoCode {
  id, code (unique), discountPercent, maxUses?, usedCount,
  isActive, expiresAt?,
  referralOwnerId?, referralBonusPercent?, referralPayoutMode?,
  createdAt, updatedAt,
  referralOwner?, referralLinks[], redemptions[], transactions[]
}
```

Если `referralOwnerId` отсутствует, промокод остаётся обычным и не создаёт
partner reward side effects.

### PromoCodeRedemption

```prisma
PromoCodeRedemption {
  id, promoCodeId, userId, orderId? (unique),
  source (MANUAL | REFERRAL_LINK_AUTO),
  status (RESERVED | CONSUMED | RELEASED),
  rewardOwnerIdSnapshot?, rewardBonusPercentSnapshot?,
  rewardPayoutModeSnapshot?,
  createdAt, consumedAt?, releasedAt?
}
```

Snapshot создаётся на reservation/order create из залоченной строки
`promo_codes`. Quote остаётся read-only preview и не мутирует БД.

### Transaction

`Transaction` уже используется как финансовый ledger для `PAYMENT`, `REFUND`,
`BONUS_ACCRUAL`, `BONUS_SPENT`, `REFERRAL_BONUS`.

Analytics key для partner referral links — `Transaction.referralLinkId`.
Analytics key для partner promo rewards — `Transaction.promoCodeId`.
Raw partial unique index `transactions_referral_bonus_once_per_order` закрепляет
one partner reward per primary order на уровне БД.

### PartnerRewardsService

`backend/src/modules/referrals/partner-rewards.service.ts` — единая точка
создания partner reward ledger.

Поддерживаемые source:

- `referral_link` — пишет `referralLinkId`, `metadata.source='referral_link'`;
- `legacy_referral` — старый user-to-user referral без link;
- `partner_promo_code` — пишет `promoCodeId`,
  `metadata.source='partner_promo_code'`;
- `manual_award` — ручное начисление без order.

Service-level и DB-level idempotency работают на уровне order: один
successful primary order может иметь максимум один `REFERRAL_BONUS`.

## API Surface

### Admin promo routes

| Route | Guard | Current contract |
|-------|-------|------------------|
| `GET /promo-codes` | `JwtAdminGuard` | list all promo codes with owner and `totalReferrerEarnings` summary |
| `GET /promo-codes/:id/stats` | `JwtAdminGuard` | detail analytics for promo uses, completed primary orders, commissionable revenue, owner earnings and payout split |
| `POST /promo-codes` | `JwtAdminGuard` | create обычный или partner promo через DTO |
| `PATCH /promo-codes/:id` | `JwtAdminGuard` | update promo и optional partner policy |
| `PATCH /promo-codes/:id/toggle` | `JwtAdminGuard` | toggle `{ isActive }` |
| `DELETE /promo-codes/:id` | `JwtAdminGuard` | delete only promo without redemptions/transactions/referral links |

Partner reward DTO rule: `referralOwnerId`, `referralBonusPercent` и
`referralPayoutMode` передаются вместе. Для снятия owner в update передаётся
`referralOwnerId=null`; backend очищает reward fields.

Admin response shape для `GET/POST/PATCH/toggle` содержит `referralOwner` и
`totalReferrerEarnings`. Summary считается по `Transaction` с
`promoCodeId=<promo.id>`, `type=REFERRAL_BONUS`, `status=SUCCEEDED`. Обычные
промокоды получают `totalReferrerEarnings=0`.

Detail stats `GET /promo-codes/:id/stats` возвращает:

- `uses` — количество `PromoCodeRedemption` со статусом `CONSUMED`;
- `completedPrimaryOrders` — completed orders с `parentOrderId=null`, связанные
  с consumed redemption этого промокода;
- `commissionableRevenue` — сумма `Order.totalAmount` по этим primary orders;
- `totalReferrerEarnings` — сумма successful `REFERRAL_BONUS` ledger с
  `Transaction.promoCodeId`;
- `payoutModeSplit[]` — разбивка начислений по
  `PromoCodeRedemption.rewardPayoutModeSnapshot`, а не по mutable
  `PromoCode.referralPayoutMode`.

Admin UI показывает stats modal из строки промокода. Он использует тот же money
formatting contract, что и list, но не разбирает `Transaction.metadata` на
клиенте: payout split приходит типизированным backend response.

Удаление — только для промокода без истории. Если есть `PromoCodeRedemption`,
partner reward `Transaction` или связанная `ReferralLink`, admin должен отключить
промокод через `isActive=false`; это сохраняет audit trail и избегает FK-drifts.

### Public/client promo validation

`GET /promo-codes/validate?code=...` calls `PromoCodesService.validate()`.
Endpoint has no user context and does not expose partner owner metadata:
response includes only `valid`, `promoId`, `code`, `discountPercent`.
Partner promo checkout decisions use internal `validateForReservation()` through
`POST /orders/quote` and `POST /orders`, where user/order context is available.

## Runtime Map

### Quote

`POST /orders/quote` calls `OrdersService.previewPricing()`, which delegates to
`buildOrderPricingSnapshot()`.

Behavior:

- manual promo from request is strict and wins over referral auto-promo;
- manual partner promo self-use is rejected before any database mutation;
- if no manual promo is passed, current `User.referralLinkId -> ReferralLink`
  may provide auto-promo;
- invalid manual promo throws;
- unavailable referral auto-promo degrades to `promoStatus='unavailable'`;
- quote does not create `Order`;
- quote does not create or consume `PromoCodeRedemption`.

### Card Purchase

`POST /orders` with card flow:

1. Builds pricing snapshot.
2. Creates `Order(PENDING)`.
3. Creates `BONUS_SPENT(PENDING)` hold if bonuses are used.
4. Creates `PromoCodeRedemption(RESERVED)` when pricing has manual or auto
   promo, including partner reward snapshot when promo has owner policy.
5. CloudPayments widget later moves the order to `PAID`.
6. Payment winner calls `OrdersService.fulfillOrder()`.

### Balance Purchase

`POST /orders` with `paymentMethod='balance'`:

1. Builds pricing snapshot.
2. Atomically decrements balance and bonuses.
3. Creates `Order(PAID)` and `PAYMENT(SUCCEEDED)`.
4. Creates promo reservation when applicable.
5. Calls `fulfillOrder()` outside the transaction.
6. Provider failure refunds balance/bonuses, marks order failed and releases
   reservation.

### Free Order

`POST /orders/:id/fulfill-free`:

1. Checks ownership and `totalAmount <= 0`.
2. Marks order `PAID`.
3. Calls `fulfillOrder()`.

### Completion

All successful primary purchase paths converge in `OrdersService.fulfillOrder()`.
For primary purchase, it:

1. Claims fulfillment.
2. Finalizes bonus spend hold.
3. Calls provider `purchaseEsim()`.
4. In finalize transaction, calls `markOrderCompleted()`.
5. `markOrderCompleted()` consumes promo reservation and increments
   `PromoCode.usedCount`.
6. `applyPurchaseCompletionEffects()` applies cashback, `totalSpent`, partner
   promo/referral reward and loyalty level recalculation.

Reward precedence:

1. Manual partner promo snapshot with owner policy creates
   `REFERRAL_BONUS(metadata.source='partner_promo_code')` through
   `PartnerRewardsService`.
2. If no manual partner promo owner snapshot exists, existing referral link /
   legacy referral attribution may create the referral reward.
3. Self-owned manual partner promo snapshots do not create reward and do not
   fallback to referral reward for the same order.

Top-up orders are detected by `parentOrderId + topupPackageCode` and go through
`fulfillTopupOrder()` without purchase completion side effects.

### Release

`markOrderFailed()` and `markOrderCancelled()` release both bonus spend hold and
promo reservation. Stale pending payment sessions are cancelled through the same
order cancellation boundary.

## Phase 17 Policy Lock

- `PromoCode` and `ReferralLink` are not merged.
- `ReferralLink` remains acquisition attribution.
- `PromoCode` remains checkout discount and becomes optional checkout
  attribution only when owner/reward policy exists.
- Manual partner promo wins over referral-link reward.
- One successful primary order creates at most one partner reward transaction.
- Normal promo without owner does not suppress referral-link reward.
- Self-reward is forbidden. V1 checkout should reject owner using their own
  partner promo.
- Top-up orders are non-commissionable.
- Reward base is `Order.totalAmount`.
- Reward policy is snapshotted at reservation/order create.
- `BALANCE` payout increments owner `bonusBalance`; `EXTERNAL` payout creates
  ledger transaction only.

## Remaining Implementation Gaps For Phase 17

- Нет известных code gaps для Phase 17 runtime на момент Step 6. Future work:
  partner-facing личный кабинет может переиспользовать тот же ledger contract,
  но это отдельное продуктовое требование вне Phase 17.

## Manual Smoke Checklist

- Ordinary promo discount only: create promo without owner, complete primary
  order, verify no `REFERRAL_BONUS.promoCodeId` transaction.
- Partner promo `BALANCE`: create owner policy, complete primary order, verify
  consumed redemption snapshot, successful `REFERRAL_BONUS.promoCodeId`, owner
  `bonusBalance` increment and stats `payoutModeSplit(BALANCE)`.
- Partner promo `EXTERNAL`: complete primary order, verify ledger exists, owner
  `bonusBalance` is unchanged and stats `payoutModeSplit(EXTERNAL)`.
- Referral precedence: user attributed by referral link A manually enters partner
  promo B, verify reward goes to promo owner B and no referral-link reward is
  created for the order.
- Ordinary promo plus referral link: manual promo without owner keeps referral
  link reward fallback.
- Idempotency: repeated completion/accounting pass does not create duplicate
  `REFERRAL_BONUS`.
- Failure/cancel/stale payment: reservation becomes `RELEASED`, `usedCount` is
  not incremented, reward is not created.
- Top-up order with promo context remains non-commissionable.

## Verification Baseline

Backend:

```bash
npx jest src/modules/promo-codes/ --runInBand
npx jest src/modules/referrals/partner-rewards.service.spec.ts --runInBand
npx jest src/modules/orders/orders.service.spec.ts --runInBand
npx jest src/modules/referrals/referrals.service.spec.ts --runInBand
npx tsc --noEmit -p tsconfig.json
```

Admin:

```bash
npx tsc --noEmit
```
