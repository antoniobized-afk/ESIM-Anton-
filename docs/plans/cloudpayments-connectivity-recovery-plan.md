# План: восстановление CloudPayments и устойчивый платёжный транспорт

Status: planned
Дата: 2026-07-11

## Цель

Восстановить все production-сценарии CloudPayments без ослабления HMAC,
идемпотентности и canonical order state machine:

- покупка eSIM новой картой через widget;
- пополнение eSIM картой;
- пополнение баланса картой;
- получение `Check`, `Pay`, `Fail` callbacks;
- повторная оплата по сохранённому CloudPayments token;
- безопасная сверка `AMBIGUOUS` repeat-charge попыток.

План не переносит платёжную бизнес-логику из backend и не использует
`client`, `admin` или `bot` как скрытый платёжный relay.

## Доказанный production-инцидент

### Текущая топология

```text
Пользователь
  -> app.mojomobile.ru
  -> Timeweb VPS 185.104.113.237
  -> client-production-bc6d.up.railway.app

Browser API calls
  -> backend-production-182f.up.railway.app

CloudPayments callbacks
  -> backend-production-182f.up.railway.app

Saved-card token charge
  backend Railway
  -> api.cloudpayments.ru/payments/tokens/charge
```

Cloudflare остаётся авторитативным DNS для `mojomobile.ru`, но запись
`app.mojomobile.ru` работает в режиме `DNS only` и направляет трафик на
Timeweb. В пользовательском HTTP-маршруте Cloudflare Proxy не участвует.

### Подтверждённые разрывы

1. `CloudPayments/Russia -> Railway backend` не работает на HTTPS-уровне.
   - TCP 443 устанавливается, но HTTP-проверки с двух московских узлов
     завершаются timeout.
   - Те же запросы из других стран быстро доходят до backend.
   - Российские запросы отсутствуют в Railway HTTP logs, то есть не входят в
     NestJS handler и не доходят до Prisma.

2. `Timeweb VPS -> Railway backend` также не работает.
   - `backend-production-182f.up.railway.app` резолвится в `69.46.46.48`.
   - TCP connection устанавливается.
   - TLS handshake зависает после `Client hello` и завершается
     `SSL connection timeout`.
   - Прямой nginx `Timeweb -> backend Railway` поэтому непригоден.

3. `Railway backend -> CloudPayments token API` не работает.
   - Production repeat charge возвращает `transport_error` без provider
     decision и без `CloudPayments TransactionId`.
   - Все пять зафиксированных production token-charge попыток, включая четыре
     попытки 2026-05-30/31, завершились `AMBIGUOUS/transport_error`.
   - Следовательно, saved-card проблема существовала до работ 2026-07-10 и не
     вызвана переносом `app.mojomobile.ru` на Timeweb.

4. Обычный widget и public id исправны.
   - Widget создаёт операцию в CloudPayments.
   - Операция `3632689835` на `19 RUB` была отклонена после того, как обязательный
     `Check` callback не дошёл до backend.
   - Backend order остался `PENDING`, потому что `Check/Fail` не были доставлены.

### Что не является причиной

- referral/marketing attribution Phase 21;
- pricing и `Order.totalAmount`;
- Prisma/PostgreSQL saturation;
- загрузка CloudPayments widget;
- отсутствие `NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID`;
- Cloudflare Proxy для `app.mojomobile.ru`: он уже выключен (`DNS only`);
- сам файл `docs/work/mojo-mobile-ru-accessibility-fix.txt`, который является
  supporting-документом и не деплоится.

## Немедленное containment до восстановления

1. Выключить saved-card CTA на production через backend-owned capability flag.
   Клиент не должен просто локально скрывать кнопку при сохранении рабочего
   backend endpoint.
2. До green smoke входящего callback-маршрута временно отключить создание
   новых card orders либо показывать явное сообщение о технических работах.
3. Не переводить `AMBIGUOUS` repeat-charge в `CANCELLED` только по timeout.
4. Уже проверенные вручную попытки, для которых одновременно выполнено:
   - в CloudPayments нет accepted/completed операции;
   - у банка нет списания;
   - отсутствует provider transaction id;
   закрывать через payment service/admin reconciliation action, а не raw SQL.
5. Не направлять callbacks обратно на прямой Railway URL как rollback: этот
   маршрут доказанно неработоспособен.

## Целевая архитектура

### Выбранный контур

Нужен отдельный платёжный транспорт из двух сетевых узлов:

```text
                         INBOUND CALLBACKS

CloudPayments (RU)
  -> payments.mojomobile.ru
  -> RU Payment Gateway (Timeweb)
  -> Global Payment Relay (VPS вне РФ)
  -> backend-production-182f.up.railway.app
  -> NestJS CloudPaymentsController

                         OUTBOUND TOKEN API

Railway backend
  -> RU Payment Gateway (Timeweb)
  -> api.cloudpayments.ru/payments/tokens/charge
```

Cloudflare используется только как authoritative DNS:

```text
A payments -> 185.104.113.237
Proxy status -> DNS only
TTL -> 300 на rollout, после стабилизации увеличить
```

### Почему нужен Global Payment Relay

Timeweb не может завершить TLS handshake с текущим backend Railway IP.
Внешний relay должен находиться в сети, из которой одновременно доступны:

- Timeweb VPS;
- `backend-production-182f.up.railway.app`.

Предпочтение — отдельный небольшой VPS в европейском регионе, а не случайная
ротация Railway domain/IP. Провайдер relay выбирается только после сетевого
preflight. Cloudflare Worker допускается как кандидат лишь после реального
`Timeweb -> Worker -> Railway` smoke; он не является default-решением.

### Responsibility boundary

- Backend остаётся единственным владельцем проверки order/amount/account,
  payment persistence, state transitions и fulfillment.
- RU gateway и global relay не парсят и не переупаковывают provider body.
- Ответ backend (`{"code":0|10|11|20}`) синхронно возвращается через оба relay
  обратно CloudPayments. Нельзя отвечать `{"code":0}` до решения backend.
- `client`, `admin`, `bot` не становятся транспортом callbacks.
- Relay не хранит PAN/CVV/token и не пишет request body/Authorization в logs.

## Security contract платёжного транспорта

### Inbound `Check/Pay/Fail`

- Разрешены только точные `POST` routes:
  - `/api/payments/cloudpayments/check`;
  - `/api/payments/cloudpayments/pay`;
  - `/api/payments/cloudpayments/fail`.
- `Content-HMAC`, `Content-Type` и raw request bytes проходят без изменения.
- HMAC продолжает проверять canonical backend owner.
- RU gateway добавляет отдельный `X-Mojo-Payment-Relay` service credential для
  global relay; global relay проверяет и удаляет его перед backend.
- Ограничить body size, методы и path allowlist; неизвестные routes возвращают
  `404`, неизвестные методы — `405`.
- Access logs содержат только route, status, duration, request id и upstream
  status. Body, `Content-HMAC`, token, card fragments и Authorization не логируются.
- TLS обязателен на каждом hop. Секрет relay хранится только в secret storage
  узлов и не попадает в репозиторий.

### Outbound `payments/tokens/charge`

- Hardcoded URL в `PaymentsService` заменить на config-owned endpoint.
- Добавить env-контракт:
  - `CLOUDPAYMENTS_TOKENS_CHARGE_URL`;
  - `CLOUDPAYMENTS_RELAY_TOKEN`;
  - `CLOUDPAYMENTS_SAVED_CARD_ENABLED`.
- Backend отправляет на RU gateway:
  - исходный CloudPayments Basic Auth;
  - `X-Request-ID` из durable attempt;
  - отдельный relay token.
- RU gateway принимает только точный tokens-charge path, проверяет relay token,
  удаляет его и проксирует запрос в `api.cloudpayments.ru`.
- Gateway не является открытым forward proxy и не принимает произвольный host/path.
- Timeout и retry backend остаются привязаны к durable idempotency key; nginx
  не делает скрытый automatic retry POST после неоднозначного transport outcome.

## Этапы реализации

### Этап 0. Заморозка и безопасная очистка инцидента

1. Ввести backend-owned capability `savedCardPaymentsEnabled=false`.
2. Client получает capability через существующий checkout/payment API и не
   предлагает сохранённую карту, если contour выключен.
3. До восстановления inbound callbacks выключить card purchase CTA или
   показывать maintenance state без создания нового `PENDING` order.
4. Собрать список текущих:
   - `PENDING` card orders без provider payment;
   - `AMBIGUOUS` repeat-charge attempts;
   - pending bonus/promo holds.
5. Сверить каждый case с CloudPayments и банковским фактом, после чего закрыть
   через canonical service action с release hold.

### Этап 1. Сетевая матрица и выбор relay

До написания transport code доказать четыре маршрута:

1. `CloudPayments/RU probes -> Timeweb:443` — быстрый TLS/HTTP.
2. `Timeweb -> candidate global relay:443` — быстрый TLS/HTTP.
3. `global relay -> Railway backend:443` — ожидаемый быстрый `404` на GET и
   `403 Invalid HMAC` на diagnostic POST.
4. `Railway backend runtime -> Timeweb:443` — быстрый TLS/HTTP для outbound
   token relay.
5. `Timeweb -> api.cloudpayments.ru:443` — быстрый TLS и детерминированный
   HTTP response без реального charge.

Gate:

- все пять маршрутов зелёные -> продолжаем relay rollout;
- любой обязательный маршрут красный -> не добавляем третий/четвёртый proxy
  вслепую, а открываем отдельный план миграции backend/payment runtime с Railway.

### Этап 2. Versioned infrastructure contract

1. Создать в репозитории отдельный infra owner для payment transport, например:
   - `infra/payment-transport/timeweb/nginx.conf`;
   - `infra/payment-transport/global-relay/nginx.conf`;
   - `infra/payment-transport/README.md`.
2. Не хранить сертификаты, private keys, relay tokens и production IP secrets.
3. Добавить команды проверки конфигурации и rollout/rollback runbook.
4. На Timeweb выпустить сертификат для `payments.mojomobile.ru`, проверить
   `certbot renew --dry-run`.
5. Настроить отдельные health endpoints gateway/relay, не связанные с
   платёжной бизнес-логикой.

### Этап 3. Inbound callbacks

1. Настроить DNS `payments.mojomobile.ru -> Timeweb`, `DNS only`.
2. Timeweb принимает только три CloudPayments callback path и пересылает raw
   request в global relay.
3. Global relay пересылает raw request на текущие backend routes.
4. Ответ backend синхронно возвращается CloudPayments без преобразования JSON.
5. Добавить integration fixture, доказывающую одинаковые raw bytes/HMAC до и
   после обоих proxy hops.
6. Сначала переключить `Check`, затем `Fail`, затем `Pay` в контролируемом
   окне, проверяя каждый endpoint. Финальный production contract требует, чтобы
   все три URL использовали один и тот же `payments.mojomobile.ru`.

### Этап 4. Обычный widget flow

После green inbound contour проверить отдельно:

1. invalid-HMAC POST -> backend `403` через полный relay path;
2. CloudPayments test `Check` -> backend `{"code":0}`;
3. declined test card -> provider `DECLINED`, backend получает `Fail`, order
   корректно закрывается и release-ит holds;
4. successful card -> `Check -> Pay`, transaction становится `SUCCEEDED`, order
   проходит `PENDING -> PAID -> PROCESSING -> COMPLETED`;
5. повторный `Pay` не запускает второй fulfillment;
6. top-up eSIM card flow;
7. balance top-up card flow;
8. реальная минимальная production операция после test-mode smoke.

Только после этих проверок card CTA возвращается пользователям.

### Этап 5. Saved-card outbound transport

1. Вынести tokens-charge URL и relay credential в typed configuration owner.
2. Расширить `.env.example` новыми keys без production values.
3. Добавить safe diagnostics Axios transport errors:
   - `error.code`;
   - `errno`/`syscall`, если доступны;
   - target hostname;
   - duration;
   - `orderId` и `attemptId`;
   - без token, Basic Auth, raw payload и card data.
4. Настроить `Railway -> Timeweb -> CloudPayments API` exact-path relay.
5. Проверить provider decline, success, timeout и duplicate idempotency cases.
6. Не включать saved-card CTA до green reconciliation этапа 6.

### Этап 6. Reconciliation `AMBIGUOUS` repeat charge

Текущий persisted marker без автоматической сверки недостаточен для возврата
saved-card в production.

1. Добавить backend owner для provider status lookup через тот же outbound relay.
2. Искать операцию по canonical invoice/order id и persisted attempt key.
3. Результаты reconciliation:
   - provider не знает операцию или подтверждён `DECLINED` -> attempt
     `DECLINED`, transaction закрывается, order `CANCELLED`, holds release;
   - provider подтверждает успешную оплату -> transaction `SUCCEEDED`, attempt
     `SUCCEEDED`, order durable-claim-ится в `PAID`, fulfillment pickup идёт по
     существующему canonical path;
   - provider status всё ещё не финальный -> attempt остаётся `AMBIGUOUS`,
     повторное списание запрещено.
4. Все transitions выполнять idempotent transaction/CAS, не через raw admin SQL.
5. Добавить admin/manual action и bounded worker retry с backoff.
6. Зафиксировать max attempts и support escalation, но не auto-decline только
   по истечению времени без provider decision.

### Этап 7. Наблюдаемость и мониторинг

Минимальные метрики:

- callback count/status/duration по `Check`, `Pay`, `Fail`;
- upstream timeout/error по hop `Timeweb -> global relay`;
- upstream timeout/error по hop `global relay -> Railway`;
- token API request outcome: success/declined/ambiguous;
- возраст и количество `AMBIGUOUS` attempts;
- `PENDING` card orders без callback старше policy threshold.

Алерты:

- `Check` timeout или non-2xx;
- отсутствие callbacks при наличии созданных widget orders;
- рост `AMBIGUOUS` больше нуля после smoke;
- certificate expiry Timeweb/global relay;
- недоступность gateway/relay health endpoint из РФ и вне РФ.

Synthetic checks не должны создавать реальные orders или charges. Допустимы:

- `GET` на POST-only callback с ожидаемым `404`;
- invalid-HMAC diagnostic POST с ожидаемым `403` через полный маршрут;
- отдельные `/healthz` на transport nodes.

## Rollout order

1. Deploy containment/capability flags с payments выключенными.
2. Закрыть подтверждённо безопасные stale/ambiguous cases.
3. Поднять и проверить global relay.
4. Поднять Timeweb payment gateway и TLS.
5. Добавить `payments.mojomobile.ru` в Cloudflare как `DNS only`.
6. Пройти end-to-end invalid-HMAC probe.
7. Переключить CloudPayments `Check/Pay/Fail` на новый домен.
8. Пройти widget test-mode matrix.
9. Включить обычную оплату новой картой.
10. Развернуть outbound token relay и reconciliation.
11. Пройти saved-card test matrix.
12. Включить saved-card capability ограниченному проценту пользователей,
    затем полностью после наблюдения.

## Rollback

- Feature flags немедленно выключают card/saved-card CTA без нового deploy.
- Callback URL нельзя возвращать на доказанно недоступный Railway domain.
- Держать предыдущую green конфигурацию payment gateway/relay как versioned
  release и откатывать nginx/application config атомарно.
- DNS TTL перед rollout — 300 секунд; DNS rollback допустим только на заранее
  проверенный standby gateway.
- При неясном результате charge не делать автоматический widget fallback и не
  запускать второй provider request.
- Если relay падает после успешного списания, Pay retries и reconciliation
  должны восстановить локальный state без второго списания/выдачи.

## Изменения в репозитории

Ожидаемые owners/call-sites:

- `backend/src/modules/payments/payments.service.ts`:
  configurable token endpoint, relay auth, safe transport diagnostics;
- отдельный компактный payment reconciliation owner внутри существующего
  `payments` module, без новой generic webhook/payment platform;
- backend payment capability response/endpoint для controlled disable;
- `client/app/product/[id]/_components/*`:
  только потребление backend capability и maintenance UX;
- `.env.example`:
  documented env keys без secrets;
- `infra/payment-transport/*`:
  versioned gateway/relay configs и operational README;
- `docs/architecture/payment-flow-audit.md`:
  durable transport/runtime contract;
- `docs/operations/cloudpayments-runbook.md`:
  rollout, smoke, triage, rollback;
- `docs/architecture/system-overview.md` и `module-map.md` при появлении нового
  infra/runtime owner.

Не использовать существующий Telegram `ServiceTokenGuard`: он привязан к
`TELEGRAM_BOT_TOKEN` и семантике bot service. Payment relay получает отдельный
credential и отдельный owner.

## Verification plan

### Backend

- unit tests configurable provider endpoint и relay header;
- transport error redaction tests;
- repeat-charge success/decline/timeout/ambiguous tests;
- reconciliation tests для `not found`, `declined`, `completed`, `pending`;
- duplicate/concurrency tests на один `orderId`;
- `pnpm --filter backend test -- <targeted payment specs>`;
- `pnpm --filter backend build`.

### Client

- saved-card capability off -> CTA отсутствует;
- card maintenance off -> order не создаётся;
- capability on -> существующий checkout flow сохраняется;
- `pnpm --filter client lint`;
- `pnpm --filter client build`.

### Infrastructure

- `nginx -t` на обоих узлах;
- TLS/certificate chain и renew dry-run;
- raw-body/HMAC fixture через два hops;
- RU/global HTTP matrix;
- exact-path allowlist и запрет open proxy;
- отсутствие body/auth/token в access/error logs.

### Production smoke

- CloudPayments operation details не содержат `3006 Unavailable` или
  `3007 UnableToConnect` для `Check`;
- Railway logs содержат `CP Check`, `CP Pay`, `CP Fail` с ожидаемой корреляцией;
- успешная операция создаёт один `PAYMENT/SUCCEEDED` и один issued eSIM;
- declined операция закрывает order и holds;
- saved-card success получает provider transaction id;
- saved-card ambiguous case автоматически/вручную сверяется без second charge;
- admin reconciliation queue не содержит необъяснённых новых payment cases.

## Definition of Done

- Все три CloudPayments callbacks доходят до canonical backend через новый
  transport и отвечают быстрее provider timeout.
- Обычная успешная и отклонённая widget-оплата подтверждены реальным E2E.
- Top-up и balance top-up card flows подтверждены отдельно.
- Saved-card token charge получает детерминированный provider response через
  outbound relay.
- `AMBIGUOUS` имеет работающий reconciliation path, а не только persisted state.
- Ни один relay не является open proxy и не логирует sensitive payload.
- Client не владеет payment relay или business validation.
- Feature flags, мониторинг, alerting и rollback проверены.
- Backend/client gates зелёные, infra failures отделены от code defects.
- Durable wiki/runbook синхронизированы только после фактического rollout.
- Прямой Railway callback URL больше не используется в кабинете CloudPayments.

## Запреты

- Не отвечать CloudPayments `{"code":0}` на gateway без решения backend.
- Не парсить/re-encode `application/x-www-form-urlencoded` между provider и backend.
- Не отключать HMAC ради проксирования.
- Не использовать `client`, `admin` или `bot` как скрытый callback relay.
- Не ротировать Railway domains/IP как production strategy.
- Не включать Cloudflare Proxy для `payments.mojomobile.ru` без отдельного
  доказанного RU transport smoke; default — `DNS only`.
- Не превращать nginx в публичный forward proxy к CloudPayments API.
- Не хранить CloudPayments API secret/token в repo или proxy logs.
- Не считать TCP connect доказательством работоспособного HTTPS маршрута.
- Не включать saved-card до восстановления reconciliation.

## Внешние доказательства и ссылки

- CloudPayments developer documentation: https://developers.cloudpayments.ru/
- HTTP-проверка текущего Railway callback из разных регионов:
  https://check-host.net/check-report/4421f6f1kd78
- Supporting incident notes:
  `docs/work/mojo-mobile-ru-accessibility-fix.txt`

