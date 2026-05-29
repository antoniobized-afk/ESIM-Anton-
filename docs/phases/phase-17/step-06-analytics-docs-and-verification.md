# Step 06 — Analytics, runtime wiki и verification

> [Назад к Phase 17](../phase-17-partner-promo-codes.md)

## Цель

Закрыть Phase 17 не только кодом, но и проверяемой аналитикой, документацией и
регрессионным baseline для будущих сессий.

## Что нужно сделать

- Добавить admin analytics для partner promo codes:
  - uses;
  - completed primary orders;
  - commissionable revenue;
  - total owner earnings;
  - payout mode split при необходимости.
- Обновить или создать wiki:
  - `docs/architecture/promo-codes-runtime.md`;
  - cross-link из `docs/architecture/referrals-runtime.md`;
  - `docs/architecture/README.md`.
- Обновить Phase 17 journal по фактическому результату.
- Синхронизировать `docs/plans/plan_promocodes.md`:
  - пометить как discovery note;
  - сослаться на Phase 17 как technical contract.
- Проверить docs на устаревшие утверждения про `PromoCodeRedemptionSource`
  только `REFERRAL_LINK_AUTO`, если enum расширяется.
- Сформировать ручной smoke checklist:
  - admin create promo;
  - client checkout;
  - completion;
  - balance/external payout;
  - referral link precedence.

## Результат шага

- Phase 17 implementation имеет актуальную runtime wiki.
- Admin analytics подтверждает выплаты по partner promo codes.
- Новая сессия может продолжить поддержку без повторного reverse engineering.

## Зависимости

- Step 05.

## Статус

- `planned`

## Журнал изменений

### 2026-05-29

- Step создан как closure/verification gate фазы.

## Файлы

- `docs/architecture/promo-codes-runtime.md`
- `docs/architecture/referrals-runtime.md`
- `docs/architecture/README.md`
- `docs/phases/phase-17-partner-promo-codes.md`
- `docs/plans/plan_promocodes.md`
- backend/admin analytics files discovered during implementation

## Тестирование / Верификация

- Backend:
  - `npx jest src/modules/promo-codes/ --runInBand`;
  - targeted `orders.service.spec.ts`;
  - targeted reward/referrals spec;
  - `npx tsc --noEmit -p tsconfig.json`.
- Admin:
  - `npx tsc --noEmit`.
- Manual smoke:
  - ordinary promo discount only;
  - partner promo BALANCE payout;
  - partner promo EXTERNAL payout;
  - partner promo beats referral link reward;
  - ordinary promo keeps referral link reward;
  - no duplicate reward on repeated completion.
