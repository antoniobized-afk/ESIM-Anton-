# Referral Runtime

> [Корневой документ wiki](../README.md)

> Актуальный runtime-контракт referral-модуля после Phase 16 (Partner Referral
> Links). Source of truth — код и Prisma schema, затем этот документ.

## Scope

Этот документ описывает текущий runtime referral-модуля:

- user-to-user referral registration (Telegram bot path);
- **partner referral links** (Telegram + Web acquisition paths);
- client-facing referral stats;
- admin partner link CRUD и analytics;
- referral bonus award с индивидуальным bonusPercent;
- auto-promo reservation lifecycle;
- spending referral bonus с учётом `minPayout`;
- lifecycle bonus hold-ов в card payment flow.

## Source Of Truth

- `backend/src/modules/referrals/referrals.controller.ts`
- `backend/src/modules/referrals/referrals.service.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/payments/cloudpayments.service.ts`
- `backend/prisma/schema.prisma` — модели `ReferralLink`, `PromoCodeRedemption`
- `client/app/referrals/page.tsx`
- `client/app/ref/[code]/page.tsx`
- `client/components/AuthProvider.tsx`
- `admin/components/ReferralLinks.tsx`
- `bot/src/api.ts`
- `bot/src/commands/index.ts`

## Prisma Contracts (Phase 16)

### ReferralLink

```
ReferralLink {
  id, code (unique), userId, label, bonusPercent (Decimal 5,2),
  promoCodeId?, isActive, expiresAt?, createdAt, updatedAt
  → user (OwnedReferralLinks), promoCode?, referredUsers[], transactions[]
}
```

### Связи в User

- `referralLinkId` — через какую партнёрскую ссылку пришёл пользователь

### Связи в Transaction

- `referralLinkId` — для `REFERRAL_BONUS` через партнёрскую ссылку (analytics key)

### PromoCodeRedemption

```
PromoCodeRedemption {
  id, promoCodeId, userId, orderId? (unique), source (MANUAL | REFERRAL_LINK_AUTO),
  status (RESERVED | CONSUMED | RELEASED), createdAt, consumedAt?, releasedAt?
}
```

### Order.promoCodeSource

- `MANUAL` — пользователь ввёл промокод руками
- `REFERRAL_LINK_AUTO` — auto-promo от партнёрской ссылки

## API Surface

### Client-facing routes

| Route | Guard | Consumer |
|-------|-------|----------|
| `GET /referrals/me` | `JwtUserGuard` | `client/app/referrals/page.tsx` |
| `POST /referrals/register-web` | `JwtUserGuard` | `client/components/AuthProvider.tsx` |
| `GET /referrals/links/:code/public` | none (public) | `client/app/ref/[code]/page.tsx` |

**`GET /referrals/me`** response:

```
{ referralCode, referralLink, referralsCount, totalEarnings,
  referralPercent, enabled, minPayout,
  referrals: [{ id, name, joinedAt, totalOrders, totalSpent }] }
```

`referralLink` строится на backend. Клиент использует это поле as-is.

**`POST /referrals/register-web`** body: `{ referralCode: string }`

One-shot привязка pending referral code к текущему JWT-пользователю.
Вызывается из `AuthProvider` после auth bootstrap.

**`GET /referrals/links/:code/public`** response:

```
{ isValid: boolean, promoCode: string | null }
```

Throttle: 30 req/min. Cache: `public, max-age=60`.
Не отдаёт `userId`, `bonusPercent`, `label`, stats или internal ids.

### Bot registration route

| Route | Guard | Consumer |
|-------|-------|----------|
| `POST /referrals/register` | `ServiceTokenGuard` | `bot/src/api.ts` |

Body: `{ userId, referralCode, telegramId }`

### Admin routes

| Route | Guard |
|-------|-------|
| `POST /referrals/links` | `JwtAdminGuard` |
| `GET /referrals/links` | `JwtAdminGuard` |
| `PATCH /referrals/links/:id` | `JwtAdminGuard` |
| `GET /referrals/links/:id/stats` | `JwtAdminGuard` |
| `GET /referrals/stats/:userId` | `JwtAdminGuard` |
| `GET /referrals/top` | `JwtAdminGuard` |

## Dual Lookup Order

`registerReferral(userId, referralCode, telegramId?)` использует фиксированный
порядок поиска:

1. `ReferralLink.code` (case-insensitive через `normalizeLookupCode`)
2. Fallback на `User.referralCode` (через `normalizeLegacyReferralCode`)

**Важно**: если `ReferralLink` найден но inactive/expired — fallback запрещён.
Метод возвращает `null`, не пытаясь интерпретировать код как legacy user code.

## Immutable Attribution Policy

- Если `User.referredById` уже заполнен → привязка блокируется
- Self-referral запрещён и для `User.referralCode`, и для `ReferralLink.userId`
- Повторная смена referrer-а не поддерживается в V1
- Attribution immutable, commercial policy mutable до первой successful primary
  purchase:
  - `referredById` / `referralLinkId` фиксируются при регистрации;
  - buyer promo и partner bonus percent до покупки всегда резолвятся из
    **текущего** `ReferralLink`;
  - completed `Order` и `REFERRAL_BONUS` ledger уже immutable и не
    пересчитываются после edit link.

## Partner Bonus Percent Flow

`awardReferralBonus()` определяет процент по каскаду:

1. `ReferralLink.bonusPercent` (если `Transaction.referralLinkId` → link exists)
2. Fallback на глобальный `REFERRAL_BONUS_PERCENT` из `SystemSettings`

`Transaction.referralLinkId` является индексируемым source of truth для
партнёрских analytics. JSON metadata не используется как аналитический ключ.

## Когда В Ссылке Заданы И `bonusPercent`, И `promoCode`

Эти поля не конфликтуют и работают одновременно, но на разных сторонах сделки:

- `ReferralLink.bonusPercent` влияет на размер `REFERRAL_BONUS` для владельца
  партнёрской ссылки
- `ReferralLink.promoCodeId` влияет на скидку приглашённого пользователя через
  checkout pricing resolver

Нормальный happy path выглядит так:

1. Пользователь приходит по partner link
2. Backend сохраняет только `referredById` и `referralLinkId`
3. На первой покупке, если пользователь не ввёл свой manual promo, применяется
   **текущий** auto-promo от ссылки
4. После successful completion владелец ссылки получает `REFERRAL_BONUS`,
   рассчитанный по **текущему** `ReferralLink.bonusPercent`

Итог: один и тот же первый успешный заказ может одновременно:

- дать скидку приглашённому пользователю по promo code ссылки
- начислить партнёру referral reward по bonus percent ссылки

## Promo Reservation Lifecycle

И manual promo, и auto-promo от партнёрской ссылки работают через единый
reservation lifecycle:

```
User registered → referral attribution set
  ↓
Quote/create resolve current ReferralLink.promoCode
  ↓
Order created with auto-promo → PromoCodeRedemption(RESERVED)
  ↓
  ├─ Order completed → CONSUMED, usedCount++
  ├─ Order failed/cancelled → RELEASED
  └─ Order stale (cleanup) → RELEASED
```

**First-purchase semantics**:
- Manual promo имеет приоритет: если пользователь вводит свой промокод на первую
  успешную покупку, referral auto-promo не применяется
- При этом referral attribution по `referralLinkId` не теряется: manual promo
  заменяет только скидку покупателя, но не отменяет партнёрский bonus percent
- Если текущий `ReferralLink` inactive/expired/missing или его текущий promo
  уже невалиден (`expired` / `deactivated` / `not found` / `exhausted`),
  checkout не должен падать на `400`: `quote` возвращает
  `promoStatus=unavailable` и pricing message для UI без мутаций
- `quote` — чистый read path: он не лечит referral state и не читает legacy
  user snapshots
- `reserveForOrder` защищает capacity через serializable transaction
- Manual promo больше не живёт на eager `usedCount++` до создания заказа: capacity reserve делается внутри order transaction, а consume идёт только на successful completion

## Web Landing / AuthProvider Flow

**Landing** (`/ref/[code]`):
1. Fetch `GET /referrals/links/:code/public`
2. Если `isValid=true` → сохранить `pendingReferralCode` в `localStorage`
3. Показать Telegram deep link CTA + Web CTA
4. Если `promoCode` есть → показать с copy action

**AuthProvider** integration:
1. One-shot `useEffect` с `useRef` guard после `isBootstrapped && user`
2. Читает `pendingReferralCode` из `localStorage`
3. Вызывает `POST /referrals/register-web { referralCode }`
4. После success → `refreshUser()`
5. Очищает `localStorage` только при success
6. При transient error код остаётся в `localStorage`, а one-shot guard сбрасывается для retry после следующего auth/bootstrap pass
7. Backend `registerReferral()` возвращает `200/null` для terminal no-op исходов (`already referred`, self-referral, inactive code, not found), поэтому success-path можно безопасно считать подтверждённым завершением one-shot без клиентской классификации статусов

Важно:
- product page обязана опираться только на `POST /orders/quote`;
- landing promo code остаётся informational hint, а не snapshot обещанной скидки.

## Admin Analytics Surface

**Список** (`GET /referrals/links`):
- Использует Prisma `_count` для summary stats (без N+1)
- Возвращает `{ data, meta: { total, page, limit, totalPages } }`

**Detail stats** (`GET /referrals/links/:id/stats`):
- `registrations` — count users с `referralLinkId`
- `ordersCount` — completed primary orders (без top-up)
- `commissionableRevenue` — sum `totalAmount` primary completed orders
- `totalReferrerEarnings` — sum `REFERRAL_BONUS` transactions по `referralLinkId`
- `referredUsers[]` — top 50 users с заказами

**Commissionable revenue исключает top-up** (`parentOrderId IS NULL`).

**Admin edit form contract**:
- `promoCodeId: null` означает intentional disconnect promo link;
- `expiresAt: null` означает сделать ссылку бессрочной;
- `undefined` в PATCH payload означает “не менять поле”;
- `bonusPercent` в UI хранится как строка формы и проходит explicit client-side validation до отправки;
- stats modal использует отдельный open-state и игнорирует late responses после закрытия.

## Referral Bonus And `minPayout`

`minPayout` относится только к referral bonus, а не ко всему `bonusBalance`.

- cashback-часть бонусов доступна без порога;
- referral-часть доступна только если referral balance `>= minPayout`;
- исторический `bonusBalance` forward-only: старые остатки не перераскладываются.

## Bonus Hold Lifecycle In Card Flow

1. При создании card order backend создаёт `BONUS_SPENT` hold (`PENDING`)
2. Availability helper учитывает hold и блокирует повторное резервирование
3. После успешной оплаты hold финализируется
4. На payment fail hold релизится
5. Stale hold-ы очищаются автоматически (TTL 30 минут в `OrdersService`)

## Integration Boundaries

- Referral award boundary живёт в purchase completion flow, а не в payment
  handlers per provider
- Top-up flow не создаёт referral reward side effects
- Loyalty/referral логика не дублируется между payment handlers

## Known Boundaries V1

- `minPayout` остаётся глобальным; per-link payout threshold не входит в V1
- Immutable attribution: смена referrer-а не поддерживается
- Commercial policy mutable until first successful purchase:
  - изменение `ReferralLink.promoCodeId` или `bonusPercent` сразу влияет на ещё
    не купивших пользователей;
  - completed orders / rewards не пересчитываются
- `PromoCodeRedemptionSource` содержит только `REFERRAL_LINK_AUTO`
- Top-up revenue не комиссионируемый; LTV с top-up — secondary metric
- `ReferralLink.code` не может совпадать с `User.referralCode` (validation guard)

## Verification Baseline

Backend:

```bash
npx jest src/modules/referrals/ --runInBand
npx jest src/modules/orders/orders.service.spec.ts --runInBand
npx jest src/modules/promo-codes/promo-codes.service.spec.ts --runInBand
npx tsc --noEmit -p tsconfig.json
```

Client/Admin:

```bash
# client
npx tsc --noEmit
# admin
npx tsc --noEmit
```

Runtime smoke:

- web login → `/referrals`
- Telegram Mini App cold start → `/referrals`
- `/start ref_<userCode>` для нового пользователя (legacy path)
- `/start ref_<partnerCode>` для нового пользователя (partner path)
- web `/ref/<partnerCode>` → auth → verify attribution
- admin create partner link → copy Telegram/Web URL
- admin detail stats → verify registrations/revenue
- order with partner bonus percent ≠ global percent
- first purchase with auto-promo → CONSUMED
- first purchase with manual promo → partner pending cleared
- failed order → reservation RELEASED
- abandoned card payment → retry after stale hold cleanup
