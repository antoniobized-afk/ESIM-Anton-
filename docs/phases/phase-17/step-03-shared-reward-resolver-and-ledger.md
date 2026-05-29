# Step 03 — Shared partner reward resolver и ledger

> [Назад к Phase 17](../phase-17-partner-promo-codes.md)

## Цель

Вынести общую логику partner reward начислений из узкого referral-link path в
проверяемый service/контракт, чтобы partner promo codes не дублировали и не
расщепляли финансовую логику.

## Что нужно сделать

- Спроектировать shared resolver/service для partner reward:
  - вход: order, reward source, owner, percent, payout mode;
  - выход: created/skipped + reason.
- Сохранить совместимость с существующим `ReferralsService.awardReferralBonus()`
  или заменить его через thin wrapper без изменения публичного поведения Phase 16.
- Зафиксировать idempotency:
  - один `orderId + reward source` не может создать duplicate partner reward;
  - повторный completion accounting возвращает no-op.
- Для partner promo reward писать `Transaction`:
  - `type: REFERRAL_BONUS` либо утверждённый новый type после ADR;
  - `promoCodeId`;
  - metadata.source = `partner_promo_code`;
  - `payoutMode`;
  - snapshot percent.
- Для referral-link reward сохранить:
  - `referralLinkId`;
  - metadata.source = `referral_link`;
  - существующие balance/external semantics.
- Обработать `BALANCE` и `EXTERNAL` одинаково для referral link и partner promo.
- Не смешивать loyalty cashback (`BONUS_ACCRUAL`) с partner reward.

## Результат шага

- Есть единая точка начисления partner reward.
- Referral link behavior из Phase 16 не регрессирует.
- Partner promo reward готов к подключению в completion flow.

## Зависимости

- Step 02.

## Статус

- `done`

## Реализация

- Добавлен `PartnerRewardsService` в
  `backend/src/modules/referrals/partner-rewards.service.ts`.
- `ReferralsModule` экспортирует `PartnerRewardsService`, чтобы следующий шаг
  мог подключить partner promo reward в order completion без дублирования
  ledger-логики.
- `ReferralsService.awardReferralBonus()` сохранён как compatibility wrapper
  для Phase 16 и теперь только резолвит referral context:
  - `referral_link` source, если есть `ReferralLink`;
  - `legacy_referral` source для старого user-to-user referral без link;
  - `manual_award` source для ручного начисления без order.
- Единая точка начисления теперь владеет:
  - расчётом `Prisma.Decimal` суммы;
  - `BALANCE` / `EXTERNAL` payout semantics;
  - order-level idempotency guard;
  - ledger записью `TransactionType.REFERRAL_BONUS`;
  - аналитическими ключами `referralLinkId` / `promoCodeId`;
  - `metadata.source` (`referral_link`, `legacy_referral`,
    `partner_promo_code`, `manual_award`).
- Partner promo reward уже поддержан сервисом через source
  `partner_promo_code`: создаётся `REFERRAL_BONUS` transaction с `promoCodeId`,
  snapshot percent и `metadata.source='partner_promo_code'`.
- `EXTERNAL` для partner promo создаёт только ledger transaction и не
  увеличивает `bonusBalance`.
- `BALANCE` для referral link / partner promo увеличивает `bonusBalance`
  владельца и создаёт ledger transaction.

## Idempotency contract

- Для любого `orderId` создаётся максимум один successful
  `REFERRAL_BONUS`, независимо от owner/source.
- Service-level precheck ищет существующий successful reward по
  `orderId + type + status`.
- DB-level guard из Step 2 (`transactions_referral_bonus_once_per_order`)
  остаётся последней линией защиты при гонках.
- Повторный completion accounting остаётся no-op через существующий
  `Order.completionAccountingAppliedAt`, а reward service дополнительно
  защищает ledger от прямого повторного вызова.

## Deferred to Step 4

- Подключить resolver в `OrdersService.applyPurchaseCompletionEffects()`:
  сначала manual partner promo snapshot, затем fallback на referral attribution.
- Добавить checkout self-reward rejection, когда есть buyer/order context.

## Журнал изменений

### 2026-05-29

- Step создан как guardrail против копирования `awardReferralBonus()` в
  `PromoCodesService` или `OrdersService`.
- Step выполнен: общий `PartnerRewardsService` добавлен, referral behavior
  сохранён через wrapper, partner promo ledger готов к подключению в completion
  flow на Step 4.

## Файлы

- `backend/src/modules/referrals/referrals.service.ts`
- `backend/src/modules/orders/orders.service.ts`
- возможный новый `backend/src/modules/referrals/partner-rewards.service.ts`
- `backend/src/modules/referrals/referrals.module.ts`
- `backend/src/modules/referrals/*.spec.ts`

## Тестирование / Верификация

- Unit tests:
  - `BALANCE` increases owner `bonusBalance`;
  - `EXTERNAL` creates transaction without balance increment;
  - duplicate reward no-op;
  - missing/invalid source no-op or explicit error by contract;
  - existing referral-link tests stay green.
