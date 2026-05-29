# Step 04 — Checkout, reservation и completion integration

> [Назад к Phase 17](../phase-17-partner-promo-codes.md)

## Цель

Подключить partner promo code reward к существующему checkout lifecycle без
обхода reservation, без double reward и без side effects на quote path.

## Что нужно сделать

- Расширить `PromoCodesService.validateForReservation()` так, чтобы backend мог
  получить partner reward policy для manual promo preview без private leak в
  public/client response.
- При `reserveForOrder()` snapshot-ить reward policy в `PromoCodeRedemption`.
- В `OrdersService.buildOrderPricingSnapshot()` оставить quote read-only:
  - discount preview допускается;
  - запись snapshot/redemption запрещена.
- В order create paths проверить все варианты:
  - card order;
  - balance order;
  - free order;
  - retry/failure paths.
- В `applyPurchaseCompletionEffects()` добавить precedence:
  1. manual partner promo redemption snapshot;
  2. existing referral link / legacy referral attribution;
  3. no reward.
- Заблокировать self-reward:
  - предпочтительно reject checkout для owner-а partner promo code;
  - если выбран другой UX, он должен быть явно зафиксирован до кода.
- Сохранить release/consume lifecycle:
  - completion -> consume;
  - fail/cancel/stale -> release;
  - duplicate completion -> no duplicate reward.

## Результат шага

- Partner promo reward начисляется только после successful primary purchase.
- Manual partner promo override не создаёт referral link reward по тому же order.
- Обычные промокоды и referral auto-promo продолжают работать.

## Зависимости

- Step 03.

## Статус

- `planned`

## Журнал изменений

### 2026-05-29

- Step создан как основной runtime integration contour фазы.

## Файлы

- `backend/src/modules/promo-codes/promo-codes.service.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/orders/orders.controller.ts`
- `backend/src/modules/orders/orders.service.spec.ts`
- `backend/src/modules/promo-codes/promo-codes.service.spec.ts`

## Тестирование / Верификация

- Tests:
  - ordinary manual promo -> discount only;
  - partner manual promo -> discount + one reward;
  - partner manual promo + referral link -> only promo owner reward;
  - ordinary manual promo + referral link -> referral link reward;
  - owner self-use rejected;
  - top-up with partner promo does not reward;
  - failed/cancelled/stale releases reservation;
  - duplicate completion does not duplicate transaction.
