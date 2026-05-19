# Step 01 — Schema, Migration Preflight And Durable Contracts

> [Назад к Phase 16](../phase-16-partner-referral-links.md)

## Цель

Заложить durable persistence contract для партнёрских ссылок, referral analytics
и auto-promo lifecycle до изменения runtime-кода.

## Что нужно сделать

- В `backend/prisma/schema.prisma` добавить `ReferralLink`.
- В `User` добавить:
  - `referralLinkId`;
  - `pendingPromoCode`;
  - `referralLinks`;
  - `referralLink`;
  - `promoCodeRedemptions`.
- В `Transaction` добавить:
  - `referralLinkId`;
  - relation `referralLink`;
  - индекс по `referralLinkId`.
- В `PromoCode` добавить relation:
  - `referralLinks`;
  - `redemptions`.
- В `Order` добавить:
  - `promoCodeSource`;
  - relation `promoCodeRedemption`.
- Добавить `PromoCodeRedemption` с lifecycle fields:
  - `status`;
  - `source`;
  - `consumedAt`;
  - `releasedAt`.
- Добавить enum:
  - `PromoCodeSource`;
  - `PromoCodeRedemptionSource` с единственным V1 source
    `REFERRAL_LINK_AUTO`;
  - `PromoCodeRedemptionStatus`.
- Не добавлять `MANUAL` в `PromoCodeRedemptionSource` в V1: ручные промокоды
  остаются на текущем `PromoCodesService.use()` без redemption ledger.
- Добавить raw partial unique index для защиты от дублей referral bonus:

```sql
CREATE UNIQUE INDEX transactions_referral_bonus_once_per_referrer_order
ON transactions ("userId", "orderId")
WHERE type = 'REFERRAL_BONUS' AND "orderId" IS NOT NULL;
```

- До применения partial index выполнить preflight:

```sql
SELECT "userId", "orderId", COUNT(*) AS duplicate_count
FROM transactions
WHERE type = 'REFERRAL_BONUS' AND "orderId" IS NOT NULL
GROUP BY "userId", "orderId"
HAVING COUNT(*) > 1;
```

- Для raw SQL index прописать rollback/down:

```sql
DROP INDEX IF EXISTS transactions_referral_bonus_once_per_referrer_order;
```

- Сгенерировать Prisma Client.

## Результат шага

- Prisma schema выражает все новые durable contracts.
- Миграция не ломает старые данные: все новые runtime-поля nullable или имеют
  безопасные defaults.
- `PromoCodeRedemption` стартует пустой таблицей; исторический `usedCount` не
  пересчитывается.
- Manual promo flow не получает ложный redemption contract в schema.
- Partial unique index не катится вслепую без preflight.

## Зависимости

- Нет.

## Статус

- `planned`

## Журнал изменений

### 2026-05-19

- Шаг выделен как foundation для Phase 16.
- Зафиксирована обязательная preflight-проверка дублей до raw partial unique
  index.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/generated` / Prisma generated client output

## Тестирование / Верификация

- `npx prisma validate`
- `npx prisma generate`
- migration SQL содержит create/drop partial index.
- preflight duplicate query задокументирован в migration/runbook output.
- `npx tsc --noEmit -p tsconfig.json` после генерации клиента не падает из-за
  schema relation errors.
