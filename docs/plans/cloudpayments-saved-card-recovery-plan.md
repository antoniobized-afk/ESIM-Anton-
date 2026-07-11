# План: восстановление оплаты привязанной картой CloudPayments

Статус: `planned`

Дата: 2026-07-11 (обновлён после review: без auto-worker, Prisma-миграций и
новых config/metrics слоёв; добавлена судьба компонентов при смене хостинга
и развилка по relay)

Рекомендация: после review оформить как Phase 23. Восстановленный widget flow
в scope реализации не входит.

## Цель

Восстановить token charge без второго списания и дать support идемпотентный
способ разрешать `AMBIGUOUS` attempts через provider lookup.

## Baseline

- `PaymentsService` напрямую вызывает
  `https://api.cloudpayments.ru/payments/tokens/charge`.
- Railway не получает provider response; attempts становятся
  `AMBIGUOUS/transport_error`.
- Timeweb достигает token API: TLS green, unauthenticated request получает
  ожидаемый `401` примерно за 0.07 секунды.
- Existing runtime уже имеет durable attempt, persisted `X-Request-ID`,
  anti-double-charge states и `reconciliation=needs_attention` read model.
- Late `Pay` callback в `payOrder` не закрывает repeat charge attempt:
  order уходит в `PAID`, attempt остаётся `AMBIGUOUS`.
- Схема `repeat_charge_attempts` уже содержит всё нужное для reconcile
  (`status`, unique `orderId`, unique `idempotencyKey`,
  `cloudPaymentsTransactionId`); миграции не требуются.
- Автоматического provider status reconciliation нет.

Подробности текущего состояния:

- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Инцидент 2026-07-11](../operations/cloudpayments-connectivity-incident-2026-07-11.md)

## Судьба при смене хостинга

Планируется переезд backend с Railway на RF-хостинг (дата на 2026-07-11 не
зафиксирована). После переезда backend достигает `api.cloudpayments.ru`
напрямую, и оба Timeweb-контура из `infra/payment-transport` становятся
ненужными: inbound callback relay виджета и outbound relay этого плана.

Временное — выбрасывается при переезде:

- nginx relay locations на Timeweb (этап 2);
- `CLOUDPAYMENTS_RELAY_TOKEN` и rotation procedure;
- relay header в transport helper (пара строк).

Постоянное — переживает переезд:

- capability flag и механизм скрытия CTA;
- `CLOUDPAYMENTS_API_BASE_URL` из конфига: при переезде меняется значение на
  прямой URL, код не трогается;
- закрытие attempt из `payOrder`;
- reconcile owner, admin action и все тесты.

Развилка по relay:

- есть дата переезда в горизонте ~месяца -> этап 2 и relay-части этапа 3 не
  выполняются; saved-card остаётся выключенным до переезда, пользователи
  платят widget-ом новой картой; в день переезда включается флаг с прямым
  URL, backlog закрывается admin action;
- даты нет -> relay выполняется как временный мост (~день инфра-работы,
  ~50 строк conf на существующем vhost).

Этап 1 (containment) выполняется немедленно в любом сценарии: выключателя
сейчас нет, CTA виден каждому пользователю с привязанной картой
(`useProductCheckout.ts` -> `GET /payments/cards/active`), каждый клик
создаёт зависший `PENDING` order и `AMBIGUOUS/transport_error` attempt.

## Target

```text
Railway PaymentsService
  -> authenticated exact-path Timeweb relay
  -> CloudPayments token/status API
```

В scope:

- saved-card capability flag (containment и rollback);
- exact-path outbound relay;
- configurable backend transport;
- provider lookup и идемпотентный support reconcile action;
- единый completion boundary для late `Pay` callback и reconcile;
- backlog cleanup и rollout.

Не входит:

- новый VPS/Worker/generic gateway;
- фоновый auto-reconciliation worker и Prisma-миграции под его bookkeeping —
  добавляются отдельным шагом, только если после включения ambiguity
  окажется частой;
- новый typed-config слой и metrics-стек;
- повторный charge для `AMBIGUOUS`;
- widget fallback на том же order;
- manual SQL state repair;
- новая multi-provider payment platform.

## Решения

1. Backend остаётся владельцем charge и state transitions; nginx только relay.
2. Конфиг по существующему паттерну `configService.get()` в конструкторе,
   без нового config-слоя:
   - `CLOUDPAYMENTS_API_BASE_URL`;
   - `CLOUDPAYMENTS_RELAY_TOKEN`;
   - `CLOUDPAYMENTS_SAVED_CARD_ENABLED`.
   Все три добавить в `.env.example`.
3. Механизм флага: при off `GET /payments/cards/active` возвращает `null`,
   `POST /payments/charge-saved-card` отказывает. CTA скрывается без деплоя
   клиента; rollback = выключить флаг.
4. Relay token хранится в Railway variables и root-readable Timeweb secret
   include; в repo/logs не попадает.
5. Timeweb разрешает только перечисленные provider paths, удаляет internal
   relay header и не retry-ит charge POST.
6. CloudPayments Basic Auth и attempt-owned `X-Request-ID` сохраняются.
7. Транспорт — один общий helper внутри payments module (base URL, Basic
   Auth, relay header, timeout, redaction); charge и lookup используют его,
   а не две копии axios-вызова.
8. При известном transaction id использовать `payments/get`; иначе
   `v2/payments/find` по `InvoiceId = order.id`.
9. Provider response сверять по invoice, amount, currency, account и известному
   transaction id.
10. `Not found` не является немедленным decline без подтверждённой provider
    policy; второй charge остаётся запрещён.
11. Late `Pay` callback и reconcile используют один idempotent completion
    boundary: `payOrder` при claim заказа закрывает attempt существующими
    полями.
12. Все запросы reconcile — точечные lookup по unique-ключам (`orderId`,
    `idempotencyKey`); никаких scans и новых индексов.

Provider contract: https://developers.cloudpayments.ru/.

## Этапы

### 1. Containment и preflight

- Добавить `CLOUDPAYMENTS_SAVED_CARD_ENABLED=false`; flag off скрывает CTA
  через `cards/active -> null` (клиент не деплоится).
- Из Railway runtime проверить TLS/latency до Timeweb `/healthz`.
- Зафиксировать существующие `AMBIGUOUS` attempts и связанные orders/holds.
- Подтвердить у CloudPayments semantics `Not found` и latest result в
  `v2/payments/find`.
- Проверить в кабинете CloudPayments отсутствие IP-restrictions на API;
  если есть — добавить Timeweb IP.

Gate: Railway достигает Timeweb; status semantics позволяют безопасные
transitions.

### 2. Outbound relay (условный — см. «Судьба при смене хостинга»)

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

- Убрать hardcoded URL: base URL и relay token читаются в конструкторе через
  `configService.get()`.
- Выделить общий transport helper: Basic Auth, relay header только в relay
  mode, persisted `X-Request-ID`, timeout, redaction.
- Логировать только target host, duration, transport code, orderId/attemptId.
- Покрыть success, decline, `401`, timeout и transport error.

### 4. Reconcile owner и completion boundary

- Компактный owner внутри payments module: lookup через общий transport,
  валидация ответа, transitions.
- Transitions:
  - confirmed `Completed` -> attempt/transaction success, order `PAID`,
    canonical fulfillment;
  - confirmed `Declined` -> существующий `markRepeatChargeDeclined` path:
    order cancel, release holds, деактивация карты по той же
    permanent-code policy;
  - pending/mismatch/malformed/untrusted `Not found` -> оставить `AMBIGUOUS`.
- `payOrder` при claim заказа закрывает attempt (`SUCCEEDED` +
  `cloudPaymentsTransactionId`) в той же транзакции.
- Reconcile корректно обрабатывает состояние "order уже `PAID`/`COMPLETED`,
  attempt ещё `AMBIGUOUS`".
- Все transitions транзакционные и безопасные к late `Pay`.

### 5. Support action и backlog

- Идемпотентный admin/support reconcile action поверх того же owner на
  существующем экране `reconciliation=needs_attention`.
- Без auto-decline по возрасту: неразрешённый attempt остаётся в
  `needs_attention` до повторного ручного reconcile.
- Закрыть production backlog `AMBIGUOUS` attempts только через этот action.

### 6. Rollout

- Наблюдаемость: структурные логи transport/reconcile outcome и существующие
  admin Telegram notifications; новый metrics-стек не заводится.
- Deploy с capability off.
- Пройти decline, success и ambiguity/reconcile scenarios.
- Доказать один provider charge, один transaction id и один fulfillment.
- Включить capability ограниченно, затем полностью после observation window.
- Rollback = capability off.

## Verification

Backend:

- config/relay/redaction tests;
- success/decline/timeout/ambiguity tests;
- provider lookup validation (invoice/amount/currency/account/tx id);
- callback-versus-reconcile concurrency; `payOrder` закрывает attempt;
- no-second-charge/no-second-fulfillment;
- targeted tests и `pnpm --filter backend build`.

Client:

- capability off скрывает saved-card CTA (`cards/active -> null`);
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

- Saved-card charge получает deterministic provider response через configured
  transport (Timeweb relay до переезда или прямой URL после).
- Success сохраняет provider transaction id.
- Decline корректно закрывает order/transaction/holds.
- Ambiguity разрешается support reconcile action без второго charge.
- Late callback/reconcile не создают второй fulfillment; attempt не остаётся
  `AMBIGUOUS` при закрытом order.
- Existing backlog сверён и закрыт.
- Prisma schema не менялась; новых слоёв (config/metrics/worker) нет.
- Relay не является open proxy и не логирует secrets.
- Capability flag и rollback проверены.

## Ссылки

- [CloudPayments runbook](../operations/cloudpayments-runbook.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Versioned transport](../../infra/payment-transport/README.md)
- [Phase 15 baseline](../phases/phase-15-payment-and-webhook-security-hardening.md)
