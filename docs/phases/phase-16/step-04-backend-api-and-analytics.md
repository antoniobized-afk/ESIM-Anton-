# Step 04 — Backend API, DTO Validation And Analytics Queries

> [Назад к Phase 16](../phase-16-partner-referral-links.md)

## Цель

Открыть безопасный backend API для admin, web registration и public landing, а
также реализовать аналитику по партнёрским ссылкам без JSON filtering и N+1.

## Что нужно сделать

- В `ReferralsController` добавить routes:
  - `POST /referrals/links` с `JwtAdminGuard`;
  - `GET /referrals/links` с `JwtAdminGuard`;
  - `PATCH /referrals/links/:id` с `JwtAdminGuard`;
  - `GET /referrals/links/:id/stats` с `JwtAdminGuard`;
  - `GET /referrals/links/:code/public` без JWT;
  - `POST /referrals/register-web` с `JwtUserGuard`.
- Добавить DTO:
  - `CreateReferralLinkDto`;
  - `UpdateReferralLinkDto`;
  - query DTO для списка/пагинации;
  - `RegisterWebReferralDto`.
- DTO constraints:
  - `code`: optional, `/^[a-zA-Z0-9_-]{3,30}$/`;
  - `bonusPercent`: `@IsNumber`, `@Min(0.01)`, `@Max(100)`;
  - `expiresAt`: ISO date string;
  - `userId` и `promoCodeId` strings.
- В service явно конвертировать `bonusPercent` в `Prisma.Decimal`.
- Public info response:
  - `isValid`;
  - `promoCode?`;
  - не отдавать `userId`, `bonusPercent`, `label`, stats, internal ids.
- Добавить throttling/cache policy для public endpoint:
  - стартово `30 req/min per IP`;
  - `Cache-Control: public, max-age=60`;
  - если нужна мгновенная деактивация, заменить на `no-store` или `max-age=5`.
- `GET /referrals/links` summary stats реализовать без per-link N+1:
  - `registrations`: groupBy/count по `User.referralLinkId`;
  - `totalReferrerEarnings`: groupBy/sum по `Transaction.referralLinkId`;
  - `ordersCount` и `commissionableRevenue`: агрегировать по completed primary
    orders (`parentOrderId IS NULL`), у которых есть successful
    `REFERRAL_BONUS` ledger с этим `referralLinkId`;
  - `lifetimeRevenueIncludingTopups`: optional secondary metric, если admin UI
    должен видеть LTV; не использовать как commission base.
- `GET /referrals/links/:id/stats` возвращает:
  - link;
  - registrations;
  - ordersCount как число rewarded primary orders;
  - commissionableRevenue как сумма rewarded primary orders;
  - optional lifetimeRevenueIncludingTopups;
  - totalReferrerEarnings;
  - referredUsers с totalOrders/totalSpent по rewarded primary orders.

## Результат шага

- Admin API может управлять партнёрскими ссылками.
- Web client может привязать referral после JWT auth.
- Public landing может получить минимальную информацию о ссылке.
- Analytics строится по индексируемым relation/columns, а не по JSON metadata.

## Зависимости

- Step 01.
- Step 02.
- Step 03 для корректных `Transaction.referralLinkId` и promo lifecycle.

## Статус

- `done`

## Журнал изменений

### 2026-05-19

- Шаг отделён от UI: сначала API contract и analytics queries, потом
  admin/client surfaces.
- Реализованы DTO с `class-validator`: `CreateReferralLinkDto`,
  `UpdateReferralLinkDto`, `ReferralLinksQueryDto`, `RegisterWebReferralDto`.
- Контроллер расширен на 6 новых routes:
  - `POST /referrals/links` (JwtAdminGuard);
  - `GET /referrals/links` (JwtAdminGuard);
  - `PATCH /referrals/links/:id` (JwtAdminGuard);
  - `GET /referrals/links/:id/stats` (JwtAdminGuard);
  - `GET /referrals/links/:code/public` (без JWT, `@Throttle 30/min`,
    `Cache-Control: public, max-age=60`);
  - `POST /referrals/register-web` (JwtUserGuard).
- `registerReferral` уже поддерживает web path через optional `telegramId`.
- Добавлены 7 targeted unit tests: public info (4), links list (2),
  web registration (1).
- Верификация: 47/47 tests passed, `tsc --noEmit` чист.

## Файлы

- `backend/src/modules/referrals/referrals.controller.ts`
- `backend/src/modules/referrals/referrals.service.ts`
- `backend/src/modules/referrals/dto/*`
- `backend/src/modules/referrals/referrals.controller.spec.ts`
- `backend/src/modules/referrals/referrals.service.spec.ts`

## Тестирование / Верификация

- Guard metadata:
  - admin routes используют `JwtAdminGuard`;
  - `register-web` использует `JwtUserGuard`;
  - bot route остаётся на `ServiceTokenGuard`.
- Public endpoint не отдаёт private fields.
- Public endpoint имеет rate/cache policy.
- Summary stats не вызывают per-link query loop.
- Detail stats корректно считает registrations, rewarded primary purchase
  orders, commissionable revenue и earnings.
- Top-up orders не попадают в `commissionableRevenue`; если LTV включён, top-up
  revenue виден только отдельной secondary метрикой.
