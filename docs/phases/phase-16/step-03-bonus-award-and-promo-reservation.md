# Step 03 — Referral Bonus Award And Promo Reservation Lifecycle

> [Назад к Phase 16](../phase-16-partner-referral-links.md)

## Цель

Подключить индивидуальный процент партнёрской ссылки к purchase completion и
реализовать безопасное автоприменение промокода без потери `maxUses` на
брошенных заказах.

## Что нужно сделать

- Изменить `ReferralsService.awardReferralBonus`:
  - сигнатура: `awardReferralBonus(referrerId, orderAmount, orderId?, referralLinkId?)`;
  - основной caller передаёт `order.user.referralLinkId ?? null`;
  - если `referralLinkId` передан, брать `bonusPercent` из `ReferralLink`;
  - если `referralLinkId === null`, брать глобальный `REFERRAL_BONUS_PERCENT`;
  - если `referralLinkId === undefined`, fallback lookup по `orderId` допустим только
    для внутренних вызовов без context;
  - считать `bonusAmount` через `Prisma.Decimal`;
  - duplicate check, `Transaction.create` и `User.bonusBalance.increment` выполнять
    в одном `$transaction`;
  - писать `Transaction.referralLinkId`.
- В `OrdersService.applyPurchaseCompletionEffects` передавать
  `order.user.referralLinkId ?? null`.
- Добавить `PromoCodesService` methods:
  - `validateForReservation(code)`;
  - `reserveForOrder(code, userId, orderId, source)`;
  - `consumeReservation(orderId)`;
  - `releaseReservation(orderId)`.
- `reserveForOrder` обязан защищать capacity:
  - использовать `$transaction`;
  - внутри transaction заблокировать promo row через `SELECT ... FOR UPDATE` или
    эквивалентный PostgreSQL row lock;
  - считать active `RESERVED` в той же transaction;
  - не создавать reservation, если `usedCount + reservedCount >= maxUses`.
- В `OrdersService` добавить transition helpers:
  - `markOrderCompleted(orderId, data?)`;
  - `markOrderFailed(orderId, data?)`;
  - `markOrderCancelled(orderId, data?)`.
- Подключить promo reservation lifecycle:
  - order create с auto-promo создаёт `RESERVED`, но не увеличивает `usedCount`;
  - completion переводит `RESERVED -> CONSUMED` и increment `usedCount` один раз;
  - fail/cancel/stale переводит `RESERVED -> RELEASED`;
  - `releaseReservation` idempotent;
  - повторный `consumeReservation` по `CONSUMED` не увеличивает `usedCount`.
- Зафиксировать first-purchase promo semantics:
  - если покупатель вручную передал `promoCode`, manual promo имеет приоритет над
    `User.pendingPromoCode`;
  - первая successful purchase с manual promo очищает partner `pendingPromoCode`
    без создания `PromoCodeRedemption` и без расхода лимита partner promo;
  - failed/cancelled/stale attempt не очищает pending только фактом
    неуспешной попытки.
- Сохранить manual promo flow через текущий `PromoCodesService.use()` в V1, чтобы не
  расширять blast radius.

## Результат шага

- Partner referral bonus начисляется по индивидуальному проценту.
- `REFERRAL_BONUS` нельзя задвоить по одному `userId + orderId`.
- Auto-promo не тратит `usedCount` на `PENDING` order.
- `PromoCode.maxUses` защищён от параллельных reservations.
- Все cancel/fail/stale paths освобождают reservation через centralized helpers.
- Partner `pendingPromoCode` не зависает после successful first purchase с ручным
  промокодом.

## Зависимости

- Step 01.
- Step 02 для `referralLinkId` на пользователе.

## Статус

- `planned`

## Журнал изменений

### 2026-05-19

- Шаг выделен как самый рискованный runtime блок фазы: ledger, деньги,
  concurrency и order lifecycle.

## Файлы

- `backend/src/modules/referrals/referrals.service.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/promo-codes/promo-codes.service.ts`
- `backend/src/modules/referrals/referrals.service.spec.ts`
- `backend/src/modules/orders/orders.service.spec.ts`
- `backend/src/modules/promo-codes/*spec.ts`

## Тестирование / Верификация

- Partner bonus использует `ReferralLink.bonusPercent`.
- Legacy bonus использует глобальный процент.
- Два параллельных completion effect не создают два `REFERRAL_BONUS`.
- Два параллельных order create с auto-promo и `maxUses = 1` не создают две active
  `RESERVED` redemption.
- `PENDING -> CANCELLED/FAILED` release-ит reservation без роста `usedCount`.
- `COMPLETED` consume-ит reservation и увеличивает `usedCount` один раз.
- Первая successful purchase с ручным промокодом очищает partner
  `pendingPromoCode` без `PromoCodeRedemption`.
- Повторный consume не увеличивает `usedCount` второй раз.
- Manual promo flow не ломается.
