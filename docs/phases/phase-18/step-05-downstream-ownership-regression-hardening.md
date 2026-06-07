# Шаг 5. Downstream ownership regression hardening

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Доказать тестами и контрактами, что account linking не меняет business ownership
и не ломает purchase/payment/referral/promo/notification flows.

## Что нужно сделать

- Добавить regression tests вокруг JWT `sub=user.id`.
- Проверить order ownership guards и `POST /orders` body-userId ignore rule.
- Проверить saved-card contract: `CloudPaymentsCardToken.userId/accountId`.
- Проверить CloudPayments webhook `AccountId` mismatch paths для order и
  balance top-up: identity linking не меняет ожидаемый `AccountId=user.id`.
- Проверить referral registration:
  - bot path expected `telegramId`;
  - web path `JwtUserGuard`;
  - no partner/referral owner drift.
- Проверить partner promo reward owner и `PartnerRewardsService`.
- Проверить email/Telegram/push notification delivery после identity link.
- Проверить, что `User.email` и `User.telegramId` остаются notification/contact
  fields, а не читаются из `UserIdentity` в existing notification paths.
- Проверить admin Users list: legacy `authProvider` не должен быть единственным
  источником правды после появления identities.
- Обновить docs gotchas, если найден drift между legacy fields и target model.

## Результат шага

- Есть targeted regression coverage по critical downstream ownership surfaces.
- Login identities не становятся owner key для заказов, денег или rewards.
- Saved-card, referral, promo и notification flows продолжают работать на
  canonical `User.id`/contact fields после link/unlink.

## Зависимости

- Шаг 3.
- Частично может идти параллельно с шагом 4.

## Статус

`implemented-local`

## Журнал изменений

### 2026-06-06

- Шаг запланирован как safety gate перед merge tooling.

### 2026-06-07

- Добавлены auth-boundary regression tests:
  - `AuthService` выпускает JWT с `sub=user.id`, не identity id/provider
    subject;
  - explicit email link не переносит orders/transactions/saved cards и не
    меняет `User.email`/`User.telegramId`;
  - unlink не переносит business ownership и не очищает contact fields.
- Подтверждены существующие downstream tests:
  - `OrdersService` сохраняет canonical `userId` в purchase/bonus/promo flows;
  - `CloudPaymentsService` отклоняет order webhook при `AccountId != user.id`;
  - `PaymentsService` payment flows проходят без identity owner key;
  - referrals и partner promo rewards используют canonical `User.id` owner
    snapshots/ledger.
- Code changes в downstream modules не потребовались: Step 5 закрепляет
  regression coverage вокруг уже существующих ownership boundaries.
- Дополнительно закрыт contact-email split-brain gap: `PATCH /users/me/email`
  валидируется через DTO и не позволяет сохранить contact email, если такой
  email уже является `UserIdentity(EMAIL)` другого пользователя.

## Файлы

- `backend/src/modules/orders/orders.service.spec.ts`
- `backend/src/modules/auth/auth.service.spec.ts`
- `backend/src/modules/auth/identity-management/auth-identity-management.service.spec.ts`
- `backend/src/modules/users/users.service.spec.ts`
- `backend/src/modules/users/dto/user-profile.dto.ts`
- `backend/src/modules/users/dto/user-profile.dto.spec.ts`
- `backend/src/modules/payments/payments.service.spec.ts`
- `backend/src/modules/referrals/referrals.service.spec.ts`
- `backend/src/modules/referrals/partner-rewards.service.spec.ts`
- `backend/src/modules/promo-codes/promo-codes.service.spec.ts`
- `backend/src/modules/notifications/*`
- `admin/components/Users.tsx`
- `admin/lib/types.ts`

## Тестирование / Верификация

- `npx jest modules/auth/ --runInBand` — passed, 33 tests.
- `npx jest modules/orders/orders.service.spec.ts --runInBand` — passed,
  36 tests.
- `npx jest modules/payments/cloudpayments.service.spec.ts modules/payments/payments.service.spec.ts --runInBand`
  — passed, 12 tests.
- `npx jest modules/referrals/ modules/promo-codes/ --runInBand` — passed,
  58 tests.
- `npx tsc --noEmit -p tsconfig.json` в backend — passed.
- `npx jest modules/users/ modules/auth/identity-management --runInBand` —
  passed, 6 suites / 30 tests.
- `npx tsc --noEmit` в client — passed.
- Admin type-check не запускался: admin users response/types не менялись.
- Manual smoke purchase + referral + notification scenarios еще нужны после
  применения миграции/backfill на dev DB.
