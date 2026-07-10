# Referral Runtime

> [Корневой документ wiki](../README.md)

> Актуальный runtime-контракт referral-модуля. Source of truth — код и Prisma schema, затем этот документ.

## Scope

Этот документ описывает текущий runtime referral-модуля:

- user-to-user referral registration;
- **partner referral links**;
- client-facing referral stats;
- admin partner link CRUD и analytics;
- referral bonus award с индивидуальным `bonusPercent`;
- auto-promo reservation lifecycle;
- spending referral bonus с учётом `minPayout`;
- completion accounting logic.

## Source Of Truth

- `backend/prisma/schema.prisma`
- `backend/src/modules/referrals/referrals.controller.ts`
- `backend/src/modules/referrals/referrals.service.ts`
- `backend/src/modules/referrals/partner-rewards.service.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/orders/order-completion-accounting.service.ts`
- `client/app/referrals/page.tsx`
- `client/app/ref/[code]/page.tsx`
- `admin/components/ReferralLinks.tsx`

## Prisma Contracts

### ReferralLink

```prisma
ReferralLink {
  id, code (unique), userId, label, bonusPercent (Decimal 5,2),
  payoutMode (ReferralPayoutMode, default BALANCE),
  promoCodeId?, isActive, expiresAt?, createdAt, updatedAt
  → user (OwnedReferralLinks), promoCode?, referredUsers[], transactions[]
}
```

### ReferralPayoutMode (enum)

- `BALANCE` — бонус зачисляется на `bonusBalance` партнёра (default).
- `EXTERNAL` — бонус НЕ зачисляется на баланс, только запись `Transaction` для статистики (выплата вне системы).

### Связи

- **User**: `referralLinkId` (какая ссылка привела пользователя), `referredById`.
- **Transaction**: `referralLinkId` (analytics key). `PromoCodeRedemption`: связывает `userId`, `promoCodeId`, `orderId`.

## API Surface

### Client / Bot

- `GET /referrals/me` (auth) — статистика для пользователя, список рефералов.
- `POST /referrals/register-web` (auth) — привязка кода после auth bootstrap (через `startapp` или `ref` из URL).
- `GET /referrals/links/:code/public` (public) — валидация кода, возврат ассоциированного промокода (без sensitive data).

### Admin

- CRUD ссылок (`POST`, `PATCH`, `GET`, `DELETE` не предусмотрено, только deactivation через `isActive=false`).
- Analytics: `GET /referrals/links/:id/stats` (users, orders, revenue), `GET /referrals/top`.

## Attribution Policy

- Ищет `ReferralLink.code` (партнерский). Fallback на `User.referralCode` (legacy user-to-user).
- Self-referral заблокирован.
- Legacy attribution (`referredById` без линка) immutable.
- Partner-link attribution (`referralLinkId`) mutable **только до первого successful primary order** (заказ, где `parentOrderId == null` и статус `COMPLETED`). Последний клик побеждает.
- Как только есть 1 успешный primary заказ — attribution фиксируется навсегда.

## Когда В Ссылке Заданы И `bonusPercent`, И `promoCode`

- `ReferralLink.promoCodeId` даёт **скидку приглашенному** (через auto-promo в checkout).
- `ReferralLink.bonusPercent` определяет **вознаграждение владельцу ссылки**.
- Они работают параллельно. Один и тот же заказ может дать скидку buyer'у и бонус referrer'у.

## Reward Precedence & PartnerRewardsService

Расчет бонусов и сайд-эффекты выполняются в `order-completion-accounting.service.ts` асинхронно после completion заказа.

Единая точка создания partner reward ledger: `PartnerRewardsService`.

**Service-level и DB-level idempotency**: один orderId может иметь максимум один `REFERRAL_BONUS` transaction со статусом `SUCCEEDED`.

**Прецеденты (кто получает бонус):**

1. **Manual Partner Promo**: Если пользователь вручную ввёл партнерский промокод в checkout, он **перекрывает** реферальную ссылку (manualPartnerPromoBlocksReferral = true). Бонус получает владелец промокода.
2. **Referral Link**: Если ручного партнерского промокода нет, но есть `referralLinkId`, бонус получает владелец `ReferralLink`.
3. **Legacy Referral**: Если нет ни того ни другого, но есть старый `referredById`, бонус идет пригласившему по дефолтному % из настроек.

Top-up заказы (`parentOrderId != null`) не создают реферальных начислений (non-commissionable).

## Planned Marketing Attribution Boundary

[Phase 21 Marketing Attribution](./marketing-attribution-runtime.md) может
связать campaign с existing `ReferralLink`, но не меняет owner этого link,
его promo/reward policy или current re-attribution rule. Marketing service
делегирует trusted registration в `ReferralsService`; он не пишет
`User.referralLinkId` напрямую и не создаёт `REFERRAL_BONUS`.
