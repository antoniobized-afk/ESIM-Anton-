# План: восстановление оплаты привязанной картой CloudPayments

Статус: `planned`

Дата: 2026-07-11

Рекомендация: после review оформить как Phase 23. Восстановленный widget flow
в scope реализации не входит.

## Цель

Восстановить token charge без второго списания и добавить provider
reconciliation для `AMBIGUOUS` attempts.

## Baseline

- `PaymentsService` напрямую вызывает
  `https://api.cloudpayments.ru/payments/tokens/charge`.
- Railway не получает provider response; attempts становятся
  `AMBIGUOUS/transport_error`.
- Timeweb достигает token API: TLS green, unauthenticated request получает
  ожидаемый `401` примерно за 0.07 секунды.
- Existing runtime уже имеет durable attempt, persisted `X-Request-ID`,
  anti-double-charge states и `reconciliation=needs_attention` read model.
- Автоматического provider status reconciliation нет.

Подробности текущего состояния:

- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Инцидент 2026-07-11](../operations/cloudpayments-connectivity-incident-2026-07-11.md)

## Target

```text
Railway PaymentsService
  -> authenticated exact-path Timeweb relay
  -> CloudPayments token/status API
```

В scope:

- saved-card capability flag;
- exact-path outbound relay;
- configurable backend transport;
- safe diagnostics;
- provider lookup и reconciliation;
- bounded worker/support action;
- backlog cleanup, monitoring, rollout.

Не входит:

- новый VPS/Worker/generic gateway;
- повторный charge для `AMBIGUOUS`;
- widget fallback на том же order;
- manual SQL state repair;
- новая multi-provider payment platform.

## Решения

1. Backend остаётся владельцем charge и state transitions; nginx только relay.
2. Typed config:
   - `CLOUDPAYMENTS_API_BASE_URL`;
   - `CLOUDPAYMENTS_RELAY_TOKEN`;
   - `CLOUDPAYMENTS_SAVED_CARD_ENABLED`.
3. Relay token хранится в Railway variables и root-readable Timeweb secret
   include; в repo/logs не попадает.
4. Timeweb разрешает только перечисленные provider paths, удаляет internal
   relay header и не retry-ит charge POST.
5. CloudPayments Basic Auth и attempt-owned `X-Request-ID` сохраняются.
6. При известном transaction id использовать `payments/get`; иначе
   `v2/payments/find` по `InvoiceId = order.id`.
7. Provider response сверять по invoice, amount, currency, account и известному
   transaction id.
8. `Not found` не является немедленным decline без подтверждённой provider
   policy; второй charge остаётся запрещён.
9. Late `Pay` callback и reconciliation используют один idempotent completion
   boundary.

Provider contract: https://developers.cloudpayments.ru/.

## Этапы

### 1. Containment и preflight

- Добавить `CLOUDPAYMENTS_SAVED_CARD_ENABLED=false` и скрыть CTA.
- Из Railway runtime проверить TLS/latency до Timeweb health.
- Зафиксировать существующие `AMBIGUOUS` attempts и связанные orders/holds.
- Подтвердить у CloudPayments semantics `Not found` и latest result в
  `v2/payments/find`.

Gate: Railway достигает Timeweb; status semantics позволяют безопасные
transitions.

### 2. Outbound relay

- Добавить secured exact paths для API test, token charge, `payments/get` и
  `v2/payments/find`.
- Добавить secret rotation procedure.
- Проверить:
  - missing/invalid relay token -> `403`;
  - unknown path/method -> `404/405`;
  - invalid provider Basic Auth -> `401`;
  - upstream TLS verification;
  - body/Auth/token отсутствуют в logs.

### 3. Backend transport

- Убрать hardcoded URL в typed config owner.
- Добавлять relay header только в relay mode.
- Сохранить Basic Auth и persisted `X-Request-ID`.
- Логировать только target host, duration, transport code, orderId/attemptId.
- Покрыть success, decline, `401`, timeout и transport error.

### 4. Reconciliation owner

- Создать компактный owner внутри payments module.
- Реализовать `payments/get` и `v2/payments/find` lookup.
- Transitions:
  - confirmed `Completed` -> attempt/transaction success, order `PAID`,
    canonical fulfillment;
  - confirmed `Declined` -> decline, order cancel, release holds;
  - pending/mismatch/malformed/untrusted `Not found` -> оставить `AMBIGUOUS`.
- Сделать transitions транзакционными и безопасными к late `Pay`.

### 5. Worker, support и backlog

- Добавить bounded status-only worker с backoff.
- Добавить idempotent support reconcile action поверх того же owner.
- Переиспользовать `reconciliation=needs_attention`.
- Добавить max lookup attempts, next check и escalation marker без auto-decline
  по возрасту.
- Закрыть production backlog только через canonical action.

### 6. Rollout и наблюдаемость

- Метрики: charge outcome, relay errors, ambiguous count/age, reconciliation
  outcome/duration.
- Deploy с capability off.
- Пройти decline, success и ambiguity/reconciliation scenarios.
- Доказать один provider charge, один transaction id и один fulfillment.
- Включить capability ограниченно, затем полностью после observation window.

## Verification

Backend:

- config/relay/redaction tests;
- success/decline/timeout/ambiguity tests;
- provider lookup validation;
- callback-versus-reconciliation concurrency;
- no-second-charge/no-second-fulfillment;
- targeted tests и `pnpm --filter backend build`.

Client:

- capability off скрывает saved-card CTA;
- capability on сохраняет saved-card/new-card switch;
- ambiguous не открывает widget;
- lint и build.

Infrastructure:

- `nginx -t`;
- Railway -> Timeweb -> CloudPayments smoke;
- auth/path/method negative gates;
- no retry POST и log redaction;
- обычный widget и `app.mojomobile.ru` остаются green.

## Definition of Done

- Saved-card charge получает deterministic provider response через Timeweb.
- Success сохраняет provider transaction id.
- Decline корректно закрывает order/transaction/holds.
- Ambiguity разрешается status lookup без второго charge.
- Late callback/reconciliation не создают второй fulfillment.
- Existing backlog сверён.
- Relay не является open proxy и не логирует secrets.
- Capability, alerts и rollback проверены.

## Ссылки

- [CloudPayments runbook](../operations/cloudpayments-runbook.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Versioned transport](../../infra/payment-transport/README.md)
- [Phase 15 baseline](../phases/phase-15-payment-and-webhook-security-hardening.md)
