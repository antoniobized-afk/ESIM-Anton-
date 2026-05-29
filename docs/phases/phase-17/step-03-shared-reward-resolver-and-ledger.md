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

- `planned`

## Журнал изменений

### 2026-05-29

- Step создан как guardrail против копирования `awardReferralBonus()` в
  `PromoCodesService` или `OrdersService`.

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
