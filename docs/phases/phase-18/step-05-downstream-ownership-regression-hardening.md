# Шаг 5. Downstream ownership regression hardening

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Доказать тестами и контрактами, что account linking не меняет business ownership
и не ломает purchase/payment/referral/promo/notification flows.

## Что нужно сделать

- Добавить regression tests вокруг JWT `sub=user.id`.
- Проверить order ownership guards и `POST /orders` body-userId ignore rule.
- Проверить saved-card contract: `CloudPaymentsCardToken.userId/accountId`.
- Проверить referral registration:
  - bot path expected `telegramId`;
  - web path `JwtUserGuard`;
  - no partner/referral owner drift.
- Проверить partner promo reward owner и `PartnerRewardsService`.
- Проверить email/Telegram/push notification delivery после identity link.
- Обновить docs gotchas, если найден drift между legacy fields и target model.

## Результат шага

- Есть targeted regression coverage по critical downstream ownership surfaces.
- Login identities не становятся owner key для заказов, денег или rewards.

## Зависимости

- Шаг 3.
- Частично может идти параллельно с шагом 4.

## Статус

`planned`

## Журнал изменений

### 2026-06-06

- Шаг запланирован как safety gate перед merge tooling.

## Файлы

- `backend/src/modules/orders/orders.service.spec.ts`
- `backend/src/modules/payments/payments.service.spec.ts`
- `backend/src/modules/referrals/referrals.service.spec.ts`
- `backend/src/modules/referrals/partner-rewards.service.spec.ts`
- `backend/src/modules/promo-codes/promo-codes.service.spec.ts`
- `backend/src/modules/notifications/*`

## Тестирование / Верификация

- Targeted backend tests.
- `npx tsc --noEmit -p tsconfig.json`.
- Manual smoke purchase + referral + notification scenarios.
