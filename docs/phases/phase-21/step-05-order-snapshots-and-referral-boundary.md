# Step 05 — Order snapshots и referral boundary integration

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Зафиксировать campaign attribution на primary order и связать partner campaign
с existing referral owner, не меняя checkout/reward semantics.

## Что нужно сделать

- Добавить marketing snapshot hook во все primary order creation paths inside
  existing local transaction; провести consumer audit `OrdersService` flows.
- Top-up paths explicitly skip primary-order snapshot/report semantics.
- При trusted campaign association with `referralLinkId` делегировать
  registration в `ReferralsService`, never write user referral fields directly.
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

`planned`

## Evidence

- Pending implementation.

## Файлы

- `backend/src/modules/orders/**`
- `backend/src/modules/referrals/**`
- `backend/src/modules/promo-codes/**`
- `backend/src/modules/marketing-attribution/**`
- `shared/contracts/checkout.ts` only if public shape genuinely changes

## Тестирование / Верификация

- Primary card/balance/free paths create one snapshot; top-up does not.
- Campaign referral registration respects self/legacy/first-completed-order
  guard and cannot generate direct ledger write.
- Manual partner promo still wins; repeated completion/accounting remains one
  reward per order.
- Lookup: `INV-TX-1`, `INV-PRISMA-1`, `INV-BND-1`, `INV-REUSE-1`,
  `INV-VER-2..4`.
