# Payment Flow Audit

> [Корневой документ wiki](../README.md)

> Аудит runtime-цепочки оплаты на 2026-05-14 после исправления stale-order bug и выноса единого pricing preview contract.

## Scope

Этот документ покрывает все пользовательские варианты оплаты:

- покупка eSIM картой через CloudPayments;
- покупка eSIM с баланса;
- бесплатная покупка (`totalAmount = 0`);
- пополнение уже выданной eSIM (`top-up`) картой;
- пополнение уже выданной eSIM с баланса;
- пополнение личного баланса через CloudPayments;
- legacy/fallback Robokassa flows, которые всё ещё живы в backend.

## Source Of Truth

- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/orders/orders.controller.ts`
- `backend/src/modules/payments/cloudpayments.service.ts`
- `backend/src/modules/payments/payments.service.ts`
- `client/app/product/[id]/page.tsx`
- `client/app/topup/[orderId]/page.tsx`
- `client/app/balance/page.tsx`
- `client/lib/api.ts`

## Current Runtime Map

### 1. Purchase by card

1. `client/app/product/[id]/page.tsx` запрашивает backend quote через `POST /orders/quote`.
2. Quote считает итог по единой формуле backend:
   - `product.ourPrice * quantity * days`
   - минус promo discount
   - минус loyalty discount текущего effective level
   - минус bonus spend
3. При клике `Оплатить картой` клиент всегда делает новый `POST /orders`.
4. Backend создаёт `Order(PENDING)` и при необходимости `BONUS_SPENT(PENDING)` hold.
5. CloudPayments widget получает `invoiceId = order.id` и `amount = order.totalAmount`.
6. `CloudPaymentsService.checkOrder()` валидирует `InvoiceId` и `Amount`.
7. Если `check` видит протухшую payment session, backend помечает заказ `CANCELLED` с `Payment session expired` и возвращает CloudPayments код `20`.
8. `CloudPaymentsService.payOrder()` сначала durable-claim-ит право на переход заказа в `PAID`, пишет `PAYMENT/SUCCEEDED`, и только победитель этого claim-а вызывает `OrdersService.fulfillOrder()`.
9. Если `pay` пришёл поздно уже после auto-expire, backend может безопасно revive только заказ с marker `Payment session expired`; admin/manual cancelled orders не поднимаются.
10. `fulfillOrder()` выдаёт eSIM, переводит заказ в `COMPLETED`, затем применяет purchase side effects:
   - finalize bonus hold;
   - cashback;
   - increment `totalSpent`;
   - referral bonus;
   - recalculation `loyaltyLevel`.

### 1A. Purchase by saved card token

1. `client/app/product/[id]/page.tsx` загружает active saved card через `GET /payments/cards/active`.
2. Если balance недостаточен и active saved card есть, purchase checkout по умолчанию предлагает оплату привязанной картой, но оставляет явный switch на новую карту.
3. При клике CTA клиент всё равно сначала создаёт новый `POST /orders`, чтобы сохранить один canonical purchase order flow и pricing snapshot.
4. Затем клиент вызывает `POST /payments/charge-saved-card { orderId }`.
5. Backend в `PaymentsService.chargeOrderWithSavedCard()`:
   - проверяет ownership order;
   - убеждается, что это именно purchase order, а не top-up;
   - находит active token пользователя;
   - создаёт durable `repeat_charge_attempts` claim по `orderId`;
   - создаёт/использует `PAYMENT(PENDING)` transaction под repeat charge;
   - вызывает CloudPayments API `payments/tokens/charge`.
6. При success backend:
   - помечает repeat-charge attempt как `SUCCEEDED`;
   - помечает payment transaction как `SUCCEEDED`;
   - переводит order в `PAID`;
   - обновляет `lastUsedAt` у token;
   - вызывает `fulfillOrder()`.
7. При token failure backend **не** переиспользует тот же order для widget fallback.
   Вместо этого:
   - repeat-charge attempt помечается как `DECLINED`;
   - order переводится в `CANCELLED`;
   - pending payment transaction закрывается;
   - bonus hold release-ится;
   - клиент создаёт fresh order и только после этого уходит в обычный widget flow новой картой.
8. При network/timeout ambiguity backend **не** трактует outcome как decline:
   - repeat-charge attempt получает статус `AMBIGUOUS`;
   - order остаётся в `PENDING`;
   - widget fallback на том же order не открывается;
   - повторный вызов `POST /payments/charge-saved-card` не делает второй provider call и возвращает `chargeState = ambiguous` с attempt correlation id.
9. При duplicate/parallel saved-card retry backend возвращает `chargeState = in_progress` или `chargeState = ambiguous`, а клиент показывает dedicated notice и CTA в `/orders` / `/order/[id]` вместо generic error.
10. Токен автоматически деактивируется только на ограниченном наборе permanent-ish provider codes; временные отказы ведут только к fallback на новую карту.
11. CloudPayments token storage и transaction audit теперь минимизированы:
   - token хранится encrypted at rest;
   - uniqueness/live lookup идут через `tokenFingerprint`;
   - transaction metadata и API response используют safelist вместо raw provider payload.

### 2. Purchase from balance

1. Product page использует тот же `POST /orders/quote`.
2. Если баланса не хватает, клиент редиректит в `/balance?topup=...&returnTo=...`.
3. Если баланса хватает, `POST /orders { paymentMethod: 'balance' }`.
4. Backend в `createWithBalance()` использует ту же pricing формулу, атомарно списывает balance и бонусы, создаёт `Order(PAID)` + `PAYMENT/SUCCEEDED`.
5. Затем вызывает `fulfillOrder()`.
6. При provider failure баланс и бонусы компенсируются, заказ переводится в `FAILED`.

### 3. Free order

1. Product page видит `quote.totalAmount <= 0`.
2. Card branch всё равно создаёт новый order через `POST /orders`.
3. Затем клиент вызывает `POST /orders/:id/fulfill-free`.
4. Backend переводит order `PENDING -> PAID` и вызывает `fulfillOrder()`.
5. Completion side effects совпадают с обычной покупкой.

### 4. eSIM top-up by card

1. `client/app/topup/[orderId]/page.tsx` запрашивает backend `POST /orders/:id/topup`.
2. Backend создаёт новый top-up order в `PENDING` с уже рассчитанным `totalAmount`.
3. Клиент открывает CloudPayments widget с новым `invoiceId = topupOrder.id`.
4. `CloudPaymentsService.payOrder()` переводит top-up order в `PAID`.
5. `fulfillOrder()` видит `parentOrderId + topupPackageCode` и уходит в `fulfillTopupOrder()`.
6. Loyalty/referral side effects здесь intentionally отсутствуют.

### 5. eSIM top-up from balance

1. `POST /orders/:id/topup { paymentMethod: 'balance' }`.
2. Backend атомарно списывает balance, создаёт top-up order в `PAID` и платёжную транзакцию.
3. `fulfillTopupOrder()` вызывает провайдера.
4. При provider failure деньги возвращаются на баланс, order помечается `FAILED`.

### 6. Balance top-up via CloudPayments

1. `client/app/balance/page.tsx` вызывает `POST /payments/balance/topup`.
2. Backend создаёт `Transaction(PENDING)` без `orderId`.
3. Клиент открывает CloudPayments widget с `invoiceId = transaction.id`.
4. `CloudPaymentsService.payBalanceTopup()` атомарно переводит transaction в `SUCCEEDED` и увеличивает `User.balance`.
5. Никаких order/referral/loyalty side effects тут быть не должно.

### 7. Legacy Robokassa paths

- `PaymentsService.createPayment(orderId)` остаётся для legacy card order flow.
- `PaymentsService.createBalanceTopupPayment(userId, amount)` остаётся для legacy balance-topup fallback.
- Webhook `POST /payments/webhook` продолжает:
  - зачислять balance top-up без order;
  - или переводить order в `PAID` и вызывать `fulfillOrder()`.

## Current Pricing Contract

### Canonical amount

Каноническая сумма, которую пользователь реально должен заплатить, это `Order.totalAmount`.

### Canonical formula

После текущего рефакторинга её считает один backend helper:

1. `baseAmount = product.ourPrice * quantity * days`
2. `promoDiscount`
3. `loyaltyDiscount`
4. `bonusUsed`
5. `totalAmount`

Quote (`POST /orders/quote`) и реальные purchase mutations (`create`, `createWithBalance`) обязаны использовать одну и ту же формулу.

## Confirmed Invariants

- Purchase completion boundary одна: `OrdersService.fulfillOrder()`.
- Top-up исключён из referral/cashback/loyalty side effects через отдельную ветку `fulfillTopupOrder()`.
- Итоговая оплачиваемая сумма canonical = `Order.totalAmount`.
- Product page больше не имеет права самостоятельно выбирать старый `PENDING` order.
- Quote и order creation теперь используют одну backend pricing формулу.
- Repeat purchase by saved card не обходит order state machine и не вводит отдельный hidden purchase lifecycle.
- Token fail не должен приводить к widget retry на том же order/invoice.
- Repeat charge по saved card теперь обязан иметь один durable attempt на order; `IN_PROGRESS` и `AMBIGUOUS` attempt запрещают второй provider charge на тот же `orderId`.
- Обычный CloudPayments widget `pay` callback тоже не должен иметь second-fulfill window: только один callback может claim-ить completion boundary и запустить `fulfillOrder()`.
- После успешного provider issuance локальная ошибка финализации больше не должна откатывать заказ в обычный `FAILED` или запускать refund-компенсацию как будто provider side-effect не случился. Такой кейс обязан оставлять durable reconciliation state без повторного `purchaseEsim()` / `topupEsim()`.

## Confirmed Risks / Remaining Gaps

### Closed by this change

- stale `PENDING` reuse в `client/app/product/[id]/page.tsx`;
- free-order bypass через переиспользование старого `PENDING` order;
- расхождение UI суммы и checkout суммы из-за отсутствия loyalty discount на product page;
- дублирование pricing logic между `create()` и `createWithBalance()`.

### Still active

- Expire policy для stale payment sessions теперь есть, но это opportunistic cleanup на order-related backend paths, а не отдельный scheduler/queue.
- Legacy Robokassa flow остаётся отдельным runtime path и использует свой webhook lifecycle.
- Client пока не показывает отдельный UI для bonus spend на product page, хотя backend pricing formula это поддерживает.
- `POST /orders/:id/fulfill-free` остаётся отдельным client-visible step вместо полного server-side auto-fulfill внутри `POST /orders`.
- Saved-card repeat charge уже защищён durable attempt contract, но для `AMBIGUOUS` outcome по-прежнему нет автоматического reconciliation worker: текущий baseline опирается на persisted attempt state + support/runbook triage.

### Closed after follow-up hardening

- race на двойную выдачу eSIM в `fulfillOrder()` закрыт через `PAID -> PROCESSING` claim до внешнего provider call;
- сценарий `provider success -> local finalize failure` больше не деградирует в ложный `FAILED`/refund:
  - issued snapshot сохраняется на `Order` даже при падении `markOrderCompleted()`;
  - заказ остаётся в `PROCESSING` с reconciliation category `issued_but_finalize_failed` или `topup_issued_but_finalize_failed`;
  - balance purchase / balance top-up не делают refund, если provider side-effect уже подтвердился, но локальная финализация упала.
- purchase completion accounting для cashback и `totalSpent` теперь one-shot и durable:
  - `Order.completionAccountingAppliedAt` служит compare-and-set marker для purchase-only accounting boundary;
  - cashback credit, `BONUS_ACCRUAL` ledger и `user.totalSpent` применяются внутри одной транзакции;
  - повторный вход в accounting path после уже выставленного marker становится safe no-op вместо повторного начисления.

## Enterprise Refactor Baseline

Что уже сделано в коде этой сессии:

- В `OrdersService` вынесен единый pricing engine `buildOrderPricingSnapshot(...)`.
- Добавлен `previewPricing(...)` и API `POST /orders/quote`.
- `create()` и `createWithBalance()` переведены на один pricing helper.
- Product page переведена на backend quote contract.
- Card purchase flow на product page теперь всегда создаёт новый order.
- В `shared/contracts/checkout.ts` появился общий contract-level type surface для `quote/create/topup`.
- Backend `orders/payments` write endpoints переведены с inline body contracts на DTO + `class-validator`.
- `POST /orders` и `POST /orders/:id/topup` выровнены к одному response shape: `{ paymentMethod, order }`.
- Добавлен CloudPayments token storage baseline в Prisma.
- Добавлены purchase-only saved-card endpoints:
  - `GET /payments/cards/active`
  - `POST /payments/charge-saved-card`
- Product page получила minimal saved-card checkout UX без отдельного wallet management раздела.

## DTO And Shared Contract Baseline

### Shared types

Source of truth для checkout boundary:

- `CreateOrderQuoteRequest`
- `CreateOrderRequest`
- `OrderQuoteResponse`
- `CreateOrderResponse`
- `CreateTopupOrderRequest`
- `CreateTopupOrderResponse`
- `CreatePaymentRequest`
- `CreateBalanceTopupRequest`

Все они живут в `shared/contracts/checkout.ts`.

### Backend DTO

Runtime validation теперь идёт через:

- `CreateOrderQuoteDto`
- `CreateOrderDto`
- `CreateTopupOrderDto`
- `CreatePaymentDto`
- `CreateBalanceTopupDto`

Это не заменяет webhooks: CloudPayments/Robokassa callbacks по-прежнему intentionally остаются provider-specific raw payload surface, потому что primary validation там — HMAC/signature contract.

## Next Plan

### Wave 1. Checkout contract hardening

- Добавить DTO для `POST /orders/quote` и `POST /orders`.
- Формализовать response type quote/order в shared contract, а не только в client-local typings.
- Перевести product page decomposition work из Phase 12 на использование quote hook/component вместо inline pricing state.

### Wave 2. Payment session lifecycle

- Зафиксировать текущее правило как stable contract:
  - stale `PENDING` order -> `CANCELLED` + `Payment session expired`;
  - `check` webhook получает `code:20`;
  - late successful `pay` может revive только expired-session order.
- При необходимости вынести cleanup из opportunistic path в отдельный scheduled operational task.

### Wave 3. Legacy retirement decision

- Явно решить, нужен ли Robokassa для production fallback.
- Если нет, вынести в отдельную migration phase и убрать split-brain payment maintenance.

## Verification Baseline

- `backend`: `npx jest src/modules/orders/orders.service.spec.ts src/modules/orders/orders.controller.spec.ts --runInBand`
- `backend`: `npx tsc --noEmit -p tsconfig.json`
- `client`: `npx tsc --noEmit --incremental false`

## Coverage Matrix

### Covered by unit tests / typechecks

- unified pricing formula for `quote/create/createWithBalance`;
- DTO validation surface for `orders/payments` write contracts;
- typed response contract at client/backend boundary;
- stale session auto-expire policy;
- late webhook recovery only for `Payment session expired`;
- ignore late webhook for non-actionable cancelled order.

### Not covered by unit tests

- real CloudPayments iframe/widget UX;
- real provider callback delivery from CloudPayments infrastructure;
- real 3DS browser flow;
- full staging purchase from balance;
- full staging top-up card/balance;
- legacy Robokassa end-to-end fallback behavior.

## Production Rollout Prerequisites

Перед production rollout нужно:

- пройти checklist из [../operations/payment-production-checklist.md](../operations/payment-production-checklist.md);
- сверить callback setup по [../operations/cloudpayments-runbook.md](../operations/cloudpayments-runbook.md);
- убедиться, что staging/test mode smoke покрывает как минимум success, fail и expired-session сценарии.

Runtime smoke:

1. Product page logged-in user:
   - loyalty discount виден в итоге;
   - promo code меняет quote;
   - повторный card click создаёт новый order.
2. Card purchase with promo:
   - widget amount равен `POST /orders` response `totalAmount`.
3. Free order:
   - создаётся новый order;
   - `fulfill-free` работает только с ним.
4. Balance purchase:
   - backend quote и backend createWithBalance совпадают по сумме.
5. Top-up card/balance:
   - по-прежнему используют fresh order id;
   - не создают loyalty/referral side effects.
6. Saved-card purchase:
   - active card видна в purchase checkout;
   - repeat charge success доводит order до `COMPLETED`;
   - token fail закрывает first order и создаёт fresh widget fallback order;
   - top-up и balance-topup не получают tokenized path раньше отдельной follow-up фазы.
