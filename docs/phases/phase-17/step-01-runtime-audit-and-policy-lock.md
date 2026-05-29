# Step 01 — Runtime audit и policy lock

> [Назад к Phase 17](../phase-17-partner-promo-codes.md)

## Цель

Перед кодом подтвердить текущий promo/referral/payment runtime и зафиксировать
финансовую policy так, чтобы реализация не строилась поверх неверных
предположений или MVP-сокращений.

## Что нужно сделать

- Перечитать текущие source of truth:
  - `backend/prisma/schema.prisma`;
  - `backend/src/modules/promo-codes/promo-codes.service.ts`;
  - `backend/src/modules/orders/orders.service.ts`;
  - `backend/src/modules/referrals/referrals.service.ts`;
  - `backend/src/modules/payments/cloudpayments.service.ts`;
  - `admin/components/PromoCodes.tsx`;
  - `docs/architecture/referrals-runtime.md`;
  - `docs/architecture/payment-flow-audit.md`.
- Подтвердить все order completion paths, где вызывается
  `applyPurchaseCompletionEffects()` или его эквивалент.
- Составить короткую runtime-карту:
  - где создаётся order;
  - где создаётся promo reservation;
  - где reservation consume/release;
  - где начисляются loyalty cashback и referral bonus.
- Зафиксировать в фазе и wiki policy:
  - manual partner promo wins over referral link reward;
  - один successful primary order создаёт максимум один partner reward;
  - owner self-reward запрещён;
  - top-up orders некомиссионные;
  - reward base = `Order.totalAmount`, пока бизнес не утвердил gross basis.
- Проверить, не нужно ли сначала закрыть debt из Phase 16, который блокирует
  безопасную интеграцию.

## Результат шага

- Есть подтверждённая runtime-карта текущего promo/referral/order flow.
- Все спорные financial policy decisions зафиксированы до schema/code changes.
- Если найден blocker, Phase 17 помечена как blocked до его закрытия.
- Создана wiki-страница [Promo Codes Runtime](../../architecture/promo-codes-runtime.md)
  с текущими границами `PromoCode`, `PromoCodeRedemption`, order completion и
  Phase 17 policy lock.

## Зависимости

- Нет.

## Статус

- `done`

## Подтверждённая runtime-карта

### Schema baseline

- `Order` уже хранит checkout attribution как `promoCode` и
  `promoCodeSource`, а также имеет `promoCodeRedemption` relation.
- `Transaction` уже имеет `referralLinkId`, но ещё не имеет `promoCodeId`;
  это ожидаемая работа Step 2, потому что Phase 17 не должна класть
  аналитический ключ партнёрского промокода только в JSON metadata.
- `PromoCode` сейчас содержит только discount/capacity/lifecycle поля:
  `code`, `discountPercent`, `maxUses`, `usedCount`, `isActive`, `expiresAt`.
  Owner/reward policy ещё отсутствуют.
- `PromoCodeRedemption` сейчас хранит `promoCodeId`, `userId`, `orderId`,
  `source`, `status`, timestamps. Snapshot reward policy ещё отсутствует.
- `ReferralPayoutMode` уже есть (`BALANCE`, `EXTERNAL`) и подходит для
  партнёрских промокодов без нового enum.

### Order и promo lifecycle

- Quote path: `POST /orders/quote` вызывает `OrdersService.previewPricing()`.
  Он использует тот же `buildOrderPricingSnapshot()`, что и реальные purchase
  mutations, но не создаёт `Order` и не создаёт `PromoCodeRedemption`.
- Manual promo имеет приоритет в `buildOrderPricingSnapshot()`: если
  `promoCode` передан пользователем, auto-promo из `ReferralLink` не
  применяется.
- Auto-promo из партнёрской ссылки применяется только если manual promo не
  передан и у пользователя есть `referralLinkId`.
- Card purchase path: `POST /orders` создаёт `Order(PENDING)`, создаёт bonus
  hold при необходимости и вызывает `PromoCodesService.reserveForOrder()` для
  manual или auto promo.
- Balance purchase path: `POST /orders` с `paymentMethod='balance'` создаёт
  `Order(PAID)`, payment transaction и promo reservation внутри одной
  транзакции, затем вызывает `fulfillOrder()`.
- Free order path: `POST /orders/:id/fulfill-free` переводит order в `PAID` и
  вызывает тот же `fulfillOrder()`.
- Successful purchase completion: `fulfillOrder()` для primary purchase
  вызывает `markOrderCompleted()` и `applyPurchaseCompletionEffects()` внутри
  одной transaction-finalize секции.
- `markOrderCompleted()` переводит `Order` в `COMPLETED` и consume-ит promo
  reservation. `consumeReservation()` увеличивает `PromoCode.usedCount` только
  при переходе `RESERVED -> CONSUMED`.
- Failure/cancel/stale paths идут через `markOrderFailed()` или
  `markOrderCancelled()`, которые release-ят bonus hold и promo reservation.
- Top-up path определяется через `parentOrderId + topupPackageCode` и уходит в
  `fulfillTopupOrder()` без `applyPurchaseCompletionEffects()`.

### Completion entrypoints

- CloudPayments widget pay callback claim-ит `Order(PENDING|expired) -> PAID`
  и только победитель вызывает `OrdersService.fulfillOrder()`.
- Saved-card repeat charge после успешного provider capture переводит order в
  `PAID` и вызывает `fulfillOrder()`.
- Legacy Robokassa webhook после подтверждения payment transaction вызывает
  `markOrderPaid()` и `fulfillOrder()`.
- Balance purchase и free order вызывают `fulfillOrder()` из orders controller
  / service, без отдельной payment-provider ветки.
- Все эти entrypoints сходятся в `fulfillOrder()`, поэтому Phase 17 reward
  integration должна жить в purchase completion boundary, а не в payment
  provider handlers.

## Policy lock перед Step 2+

- `PromoCode` и `ReferralLink` остаются разными сущностями:
  `ReferralLink` = acquisition attribution, `PromoCode` = checkout discount и
  optional checkout attribution.
- Manual partner promo wins over referral link reward: если на order есть
  manual partner promo redemption с owner snapshot, reward получает владелец
  промокода, а referral-link reward для этого order не создаётся.
- Один successful primary order создаёт максимум один partner reward
  transaction независимо от источника (`ReferralLink` или partner `PromoCode`).
- Обычный promo без owner не блокирует существующий referral-link reward.
- Self-reward запрещён: владелец partner promo не должен получить скидку/reward
  по собственному order. V1 policy: такой checkout должен быть невалиден, а не
  silently давать скидку без reward.
- Top-up orders (`parentOrderId IS NOT NULL`) некомиссионные.
- Reward base = `Order.totalAmount`, то есть фактически оплаченная сумма после
  promo, loyalty discount и bonus spend.
- Reward policy snapshot создаётся при reservation/order create, не в quote.
- `BALANCE` увеличивает `bonusBalance` владельца и создаёт transaction;
  `EXTERNAL` создаёт только transaction для внешней выплаты.

## Phase 16 debt-gate

Найденные ограничения не блокируют Step 2, но должны быть закрыты в рамках
Phase 17 до включения фичи:

- `PromoCodesController` сейчас использует inline body types без DTO classes.
  Partner promo admin writes должны добавляться через DTO + `class-validator`.
- Нет `Transaction.promoCodeId`, поэтому партнёрские promo rewards пока нельзя
  аналитически отличать через индексируемый FK.
- Нет snapshot полей в `PromoCodeRedemption`, поэтому reward policy сейчас не
  immutable для pending/historical orders.
- Текущий duplicate guard в `awardReferralBonus()` проверяет существующий
  `REFERRAL_BONUS` для конкретного `referrerId + orderId`, но Phase 17 требует
  order-level one-reward guard.
- Текущий `applyPurchaseCompletionEffects()` всегда вызывает referral reward,
  если есть `referredById`; Phase 17 должна вставить resolver, который сначала
  проверяет manual partner promo snapshot и только затем fallback на referral
  attribution.

## Журнал изменений

### 2026-05-29

- Step создан как обязательный gate перед реализацией Partner Promo Codes.
- Step выполнен: подтверждены schema/runtime границы, completion entrypoints,
  promo reservation lifecycle и financial policy. Блокера для перехода к Step 2
  нет; найденные gaps являются целевым scope Phase 17.

## Файлы

- `docs/phases/phase-17-partner-promo-codes.md`
- `docs/architecture/referrals-runtime.md`
- `docs/architecture/payment-flow-audit.md`
- `docs/architecture/promo-codes-runtime.md` (создан на Step 1; в финальном
  шаге обновить, если implementation изменит runtime-контракт)

## Тестирование / Верификация

- Документированная runtime-карта совпадает с текущим кодом.
- Все утверждения о completion/reservation paths подтверждены ссылками на код.
- Если точный runtime не подтверждён, реализация не начинается.
