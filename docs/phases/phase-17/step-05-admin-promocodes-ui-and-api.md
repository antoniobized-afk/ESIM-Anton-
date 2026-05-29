# Step 05 — Admin PromoCodes UI и typed API

> [Назад к Phase 17](../phase-17-partner-promo-codes.md)

## Цель

Дать администратору полноценное управление обычными и партнёрскими
промокодами без `any`, alert/confirm regressions и без смешивания PromoCodes UI
с ReferralLinks UI.

## Что нужно сделать

- Обновить backend admin-facing promo endpoints:
  - create partner promo;
  - update reward policy;
  - clear reward owner/policy;
  - list with owner and summary fields.
- Если текущий controller не имеет `PATCH /promo-codes/:id`, добавить
  типизированный endpoint вместо перегруза `toggle`.
- В admin types добавить поля owner, payout mode, bonus percent, earnings.
- Использовать существующие UI patterns:
  - `Button`;
  - `Modal`;
  - `ToastProvider`;
  - `ConfirmDialog`;
  - `UserPicker`;
  - payout select как в `ReferralLinks`.
- В форме промокода добавить опциональный блок partner reward:
  - owner picker;
  - bonus percent;
  - payout mode;
  - clear owner/policy.
- В таблице показать:
  - код;
  - скидку;
  - used/max;
  - owner;
  - payout mode;
  - reward percent;
  - начислено.
- Не показывать владельца/финансовую policy в клиентском checkout UI.

## Результат шага

- Admin может создавать и сопровождать partner promo codes.
- UI сохраняет существующий стиль Phase 11/16 и не добавляет локальный
  God-component без типов.
- API contracts типизированы с обеих сторон.

## Зависимости

- Step 04.

## Статус

- `planned`

## Журнал изменений

### 2026-05-29

- Step создан для отдельного admin/UI contour.

## Файлы

- `backend/src/modules/promo-codes/promo-codes.controller.ts`
- `backend/src/modules/promo-codes/promo-codes.service.ts`
- `admin/components/PromoCodes.tsx`
- `admin/lib/api.ts`
- `admin/lib/types.ts`
- `admin/components/ui/UserPicker.tsx`
- `admin/components/ui/PromoSelect.tsx` (только если нужен reuse, без
  искусственной связки)

## Тестирование / Верификация

- Admin type-check clean.
- UI scenarios:
  - create ordinary promo;
  - create partner promo;
  - edit partner percent/payout;
  - remove owner and verify promo becomes ordinary;
  - toggle active still works;
  - delete behavior не ломает historical transactions.
