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

- `done`

## Реализация

- `PromoCodesService.validateForReservation()` возвращает internal
  `partnerRewardPolicy` для backend checkout context.
- Public `PromoCodesService.validate()` сохраняет прежний безопасный response:
  `valid`, `promoId`, `code`, `discountPercent` без owner/reward metadata.
- `reserveForOrder()` использует тот же resolver reward policy и snapshot-ит
  owner/percent/payout mode из залоченной строки `promo_codes`.
- `OrdersService.buildOrderPricingSnapshot()` остаётся read-only на quote path,
  но теперь отклоняет manual partner promo, если buyer совпадает с owner.
- `OrdersService.fulfillOrder()` перед provider call загружает минимальный
  `PurchaseAccountingOrder` с `PromoCodeRedemption` snapshot для accounting,
  не расширяя client/admin `findById()` response приватными partner fields.
- `applyPurchaseCompletionEffects()` применяет precedence:
  1. manual partner promo snapshot через `PartnerRewardsService`;
  2. referral link / legacy referral fallback;
  3. no reward.
- Если в данных уже оказался self-owned manual partner promo snapshot, reward не
  начисляется и fallback в referral reward не выполняется.

## Журнал изменений

### 2026-05-29

- Step создан как основной runtime integration contour фазы.
- Step выполнен: checkout получил self-reward guard, internal promo reservation
  preview получил partner reward policy без public leak, а completion accounting
  теперь сначала обрабатывает manual partner promo snapshot и только затем
  fallback-ится в referral flow.
- Покрытие добавлено в `promo-codes.service.spec.ts` и
  `orders.service.spec.ts`: internal/public promo contract, self-use reject,
  partner promo precedence, no-fallback для self-owned snapshot.

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

Фактически прогнано:

```bash
pnpm exec jest src/modules/promo-codes/promo-codes.service.spec.ts --runInBand
pnpm exec jest src/modules/orders/orders.service.spec.ts --runInBand
pnpm exec tsc --noEmit -p tsconfig.json
```
