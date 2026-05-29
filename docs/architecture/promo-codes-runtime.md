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
| `GET /promo-codes` | `JwtAdminGuard` | list all promo codes |
| `POST /promo-codes` | `JwtAdminGuard` | create обычный или partner promo через DTO |
| `PATCH /promo-codes/:id` | `JwtAdminGuard` | update promo и optional partner policy |
| `PATCH /promo-codes/:id/toggle` | `JwtAdminGuard` | toggle `{ isActive }` |
| `DELETE /promo-codes/:id` | `JwtAdminGuard` | delete promo |

Partner reward DTO rule: `referralOwnerId`, `referralBonusPercent` и
`referralPayoutMode` передаются вместе. Для снятия owner в update передаётся
`referralOwnerId=null`; backend очищает reward fields.

### Public/client promo validation

`GET /promo-codes/validate?code=...` calls `PromoCodesService.validate()`.
Current endpoint has no user context and should not expose partner owner
metadata. Partner promo checkout decisions must be made through `POST
/orders/quote` and `POST /orders`, where user/order context is available.

## Runtime Map

### Quote

`POST /orders/quote` calls `OrdersService.previewPricing()`, which delegates to
`buildOrderPricingSnapshot()`.

Behavior:

- manual promo from request is strict and wins over referral auto-promo;
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
6. `applyPurchaseCompletionEffects()` applies cashback, `totalSpent`, referral
   bonus and loyalty level recalculation.

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

- Extend admin typed API/UI after backend contracts are stable.
- Integrate checkout self-reward rejection when buyer context is available.
- Connect `OrdersService.applyPurchaseCompletionEffects()` to choose manual
  partner promo snapshot before referral fallback.

## Verification Baseline

Backend:

```bash
npx jest src/modules/promo-codes/ --runInBand
npx jest src/modules/orders/orders.service.spec.ts --runInBand
npx jest src/modules/referrals/referrals.service.spec.ts --runInBand
npx tsc --noEmit -p tsconfig.json
```

Admin:

```bash
npx tsc --noEmit
```
