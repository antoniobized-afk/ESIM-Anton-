# Payment Production Checklist

> [Корневой документ wiki](../README.md)

> Pre-deploy и post-deploy checklist для checkout/payment chain: CloudPayments, balance purchase, top-up и legacy Robokassa compatibility.

## Scope

Этот checklist нужен перед любым merge/push, который затрагивает:

- `backend/src/modules/orders/*`
- `backend/src/modules/payments/*`
- `client/app/product/[id]/page.tsx`
- `client/app/topup/[orderId]/page.tsx`
- `client/app/balance/page.tsx`
- `client/lib/api.ts`
- shared checkout contracts / DTO
- repeat-charge / saved-card checkout paths

## Что уже покрыто кодом

Перед rollout не нужно заново доказывать:

- единая pricing formula для `quote/create/createWithBalance`;
- stale `PENDING` reuse bug на product page;
- expired payment session policy;
- late webhook recovery только для `Payment session expired`;
- DTO validation для `quote/create/topup/payments`;
- typed response contract `{ paymentMethod, order }` для order/topup create flows.
- webhook fast-ack contract и durable `PAID -> PROCESSING` anti-double-fulfill boundary.

Это уже покрывается unit tests и typecheck baseline.

## Что не покрыто unit tests

Требует staging/manual smoke:

- реальный CloudPayments widget flow;
- реальный CloudPayments token charge flow (`payments/tokens/charge`);
- реальный callback delivery `check/pay/fail` из CloudPayments;
- 3DS user path;
- balance purchase end-to-end;
- top-up card end-to-end;
- Robokassa compatibility smoke, пока path остаётся активным.

## Pre-deploy

Проверить:

- backend и client typecheck зелёные;
- order/payment unit tests зелёные;
- production/staging env не требуют новых secrets;
- CloudPayments public id и API secret заполнены корректно;
- CloudPayments callback URLs направлены на правильный backend domain;
- terminal-side tokenization / card-save option реально включены в CloudPayments Back Office;
- Robokassa credentials не сломаны, если path всё ещё поддерживается;
- support понимает policy `Payment session expired` и умеет читать reconciliation signals.

## CloudPayments Test Mode

По официальной документации CloudPayments новый сайт в Back Office изначально находится в test mode, а для тестирования доступны специальные карты.

Практически это значит:

- widget flow можно прогнать без реального списания;
- staging smoke можно делать через test cards;
- unit/integration tests внутри репо это не заменяет, потому что сам widget и callback delivery остаются внешним провайдерным runtime.

Рекомендуемые test cards для staging smoke:

- `4242 4242 4242 4242` — успешная Visa 3DS
- `5555 5555 5555 4444` — успешная Mastercard 3DS
- `4012 8888 8888 1881` — insufficient funds
- `4111 1111 1111 1111` — успешная Visa без 3DS

Expiry date: любая будущая.  
CVV: любой.

Source:

- https://developers.cloudpayments.ru/
- https://developers.cloudpayments.ru/en/

## Staging Smoke Matrix

### 1. Card purchase happy path

- Открыть product page под пользователем с loyalty level.
- Убедиться, что UI total = backend quote total.
- Оплатить тестовой успешной картой.
- Проверить:
  - order создаётся новый;
  - `check` и `pay` callbacks приходят;
  - `pay` callback отвечает быстро и не ждёт provider issuance >30s;
  - после widget success клиент попадает на `/order/[id]` и видит честный `PAID/PROCESSING/COMPLETED` progression;
  - order доходит до `COMPLETED`;
  - eSIM fulfillment / success path не ломается.

### 2. Card purchase fail path

- Запустить оплату картой `insufficient funds`.
- Проверить:
  - `fail` callback не валит backend;
  - order не становится `PAID/COMPLETED`;
  - bonus hold, если был, release-ится корректно.

### 2A. Saved-card purchase success

- Под пользователем с уже сохранённым token открыть product page.
- Проверить:
  - UI показывает привязанную карту и отдельный путь на новую карту;
  - `POST /orders` создаёт fresh `PENDING` order;
  - `POST /payments/charge-saved-card` проходит успешно;
  - order доходит до `COMPLETED`;
  - новый widget flow при этом не открывается;
  - top-up/balance routes не меняются.

### 2B. Saved-card purchase fallback

- Запустить purchase по saved card на токене/карте, которая даёт decline.
- Проверить:
  - first order закрывается, а не переиспользуется;
  - bonus hold release-ится;
  - клиент получает message и уходит в fresh widget fallback order;
  - widget fallback order имеет новый `order.id`;
  - permanent-ish provider decline при необходимости деактивирует token, временный decline — нет.

### 3. Expired session + late pay

- Создать card order.
- Дождаться или симулировать истечение payment session.
- Проверить, что order получает `CANCELLED + Payment session expired`.
- Затем завершить платёж поздним callback в staging-safe сценарии.
- Проверить, что backend умеет revive только expired-session order.

### 4. Free order

- Промокод доводит сумму до `0`.
- Проверить:
  - создаётся новый order;
  - `fulfill-free` работает только для него;
  - purchase side effects не расходятся.

### 5. Balance purchase

- Проверить quote.
- Пополнить balance.
- Купить тариф с баланса.
- Проверить:
  - amount совпадает с quote;
  - balance списался;
  - order дошёл до `COMPLETED`;
  - cashback/referral/loyalty side effects сохранились.

### 6. Top-up by card

- Купить/иметь выданную eSIM.
- Создать top-up order.
- Оплатить тестовой успешной картой.
- Проверить:
  - `paymentMethod = card`;
  - top-up использует новый `order.id`;
  - после widget success top-up order виден в `PAID/PROCESSING/COMPLETED` lifecycle;
  - loyalty/referral side effects не начисляются.

### 7. Top-up by balance

- Пополнить balance.
- Выполнить top-up с баланса.
- Проверить:
  - balance списался;
  - при provider success top-up завершён;
  - при provider fail баланс возвращается.

### 8. Robokassa compatibility

- Минимум один smoke:
  - создание Robokassa payment для order;
  - или balance top-up через Robokassa fallback.

Если Robokassa больше не нужен бизнесу, это нужно фиксировать отдельной migration phase, а не молча переставать его проверять.

## Post-deploy

Проверить:

- `GET /api/orders?reconciliation=needs_attention` не даёт 500;
- новые card orders создаются и доходят до callback path;
- `GET /api/orders?reconciliation=needs_attention` показывает как минимум `webhook_acked_fulfillment_pending`, `stuck_processing`, `issued_but_finalize_failed`, если такие кейсы есть;
- в админке для `PAID` доступен recovery action `Retry fulfillment`;
- в админке для `PROCESSING` + `issued_but_finalize_failed` доступен recovery action `Дофинализировать` без повторного provider call;
- saved-card purchase path не режет обычный widget purchase path;
- support/admin видят корректный `paymentMethod` и финансовые поля;
- нет всплеска `Payment session expired` для свежих заказов;
- нет regressions в `/product/[id]`, `/balance`, `/topup/[orderId]`.

## Release Decision

Можно катить в production, если:

- unit tests и typechecks зелёные;
- staging smoke matrix пройдена хотя бы по happy-path + failure-path + expired-session path;
- для Phase 14 дополнительно пройдены:
  - saved-card purchase success;
  - saved-card fallback на новую карту;
- callback URLs и test/prod mode CloudPayments проверены вручную;
- Robokassa path либо smoke-проверен, либо бизнес официально согласовал его вывод в отдельной фазе.
