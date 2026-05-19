# Шаг 4. Payment/provider reconciliation и operational visibility

> [⬅️ Назад к фазе](../phase-10-client-payments-and-provider-hardening.md)

## Цель

Снизить операционный риск сценариев, где платёж уже успешен, а provider side-effect завершился ошибкой или завис в промежуточном состоянии.

## Что нужно сделать

### 4.1 Зафиксировать state combinations

- Описать подтверждённые сценарии:
  - card payment succeeded -> order `PAID` -> provider failed -> order `FAILED`;
  - balance purchase -> balance debited -> provider failed -> refund;
  - topup balance flow -> debit -> provider failed -> refund.
- Для каждого сценария указать:
  - что видит пользователь;
  - что остаётся в БД;
  - какой manual follow-up нужен.

### 4.2 Добавить minimal detection / signal path

- Ввести минимальный механизм обнаружения paid-but-not-fulfilled scenario:
  - structured error log;
  - admin-visible marker;
  - отдельный query/report/list для ручной обработки;
  - или другой минимально-инвазивный operational signal.
- Не переделывать всю state machine и не добавлять speculative queue architecture без явной необходимости.

### 4.3 Зафиксировать retry/compensation policy

- Разделить policy для:
  - provider retry;
  - user compensation/refund;
  - manual support handling.
- Отдельно отметить различия между CloudPayments card orders, balance purchase и eSIM top-up.

## Результат шага

- Partial-failure cases больше не являются "тихими" operational dead zones.
- Для support/engineering появляется минимальный, но понятный путь triage и follow-up.

## Статус

Завершено

## Журнал изменений

- **[2026-05-08]** `OrdersService` получил derived `reconciliation` snapshot для заказов: marker вычисляется из `status`, успешной `PAYMENT` transaction, refund transaction, `parentOrderId` и `errorMessage` без новой схемы БД.
- **[2026-05-08]** Для provider failure после успешной оплаты добавлен structured operational signal `Reconciliation required` с категорией (`provider_failed_after_card_charge`, `provider_failed_balance_refunded`, `topup_failed_balance_refunded`), payment method/provider и refund status.
- **[2026-05-08]** `GET /orders` для админки теперь принимает `reconciliation=needs_attention`, а `findAll`, `findById` и `findByUser` возвращают reconciliation marker вместе с заказом для ручного triage.
- **[2026-05-19]** Follow-up hardening закрыл ещё один blocking partial-failure mode: если `purchaseEsim()` / `topupEsim()` уже вернул success, а локальная финализация (`markOrderCompleted`) упала, заказ больше не деградирует в ложный `FAILED` и balance-path не делает refund поверх уже выданной eSIM. Вместо этого issued snapshot сохраняется на `Order`, статус остаётся `PROCESSING`, а reconciliation category становится `issued_but_finalize_failed` или `topup_issued_but_finalize_failed`.

## Файлы

- `backend/src/modules/payments/cloudpayments.service.ts`
- `backend/src/modules/payments/payments.service.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/orders/orders.controller.ts`
- wiki/runbooks

## Тестирование / Верификация

- `npx nest build` в `backend` проходит после добавления reconciliation marker и admin filter.
- Provider failure после successful payment теперь оставляет диагностируемое состояние без silent dead zone:
  - заказ остаётся `FAILED`;
  - у order detail/list есть `reconciliation.needsAttention=true`;
  - в логах появляется structured `Reconciliation required` signal.
- Balance/topup compensation paths продолжают различаться по marker category:
  - card -> `provider_failed_after_card_charge`;
  - balance purchase -> `provider_failed_balance_refunded`;
  - balance topup -> `topup_failed_balance_refunded`.
- Provider-success/local-finalize-failure теперь имеет отдельный durable triage path:
  - заказ остаётся `PROCESSING`, а не ложным `FAILED`;
  - `providerOrderId` / `providerResponse` и при purchase также `iccid` / `qrCode` / `activationCode` сохраняются для recovery;
  - balance purchase и balance top-up не делают automatic refund, если provider side-effect уже случился.
- Ограничение baseline: это detection/triage path, а не автоматический retry worker и не отдельная reconciliation queue.
