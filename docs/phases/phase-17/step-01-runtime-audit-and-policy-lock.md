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

## Зависимости

- Нет.

## Статус

- `planned`

## Журнал изменений

### 2026-05-29

- Step создан как обязательный gate перед реализацией Partner Promo Codes.

## Файлы

- `docs/phases/phase-17-partner-promo-codes.md`
- `docs/architecture/referrals-runtime.md`
- `docs/architecture/payment-flow-audit.md`
- `docs/architecture/promo-codes-runtime.md` (создать или обновить в финальном
  шаге, но policy можно зафиксировать уже здесь)

## Тестирование / Верификация

- Документированная runtime-карта совпадает с текущим кодом.
- Все утверждения о completion/reservation paths подтверждены ссылками на код.
- Если точный runtime не подтверждён, реализация не начинается.
