# CloudPayments Runbook

> [Корневой документ wiki](../README.md)

Точные production-настройки и проверки. Payment state contract:
[Payment Flow Audit](../architecture/payment-flow-audit.md).

## Back Office callbacks

```text
Check https://payments.mojomobile.ru/api/payments/cloudpayments/check
Pay   https://payments.mojomobile.ru/api/payments/cloudpayments/pay
Fail  https://payments.mojomobile.ru/api/payments/cloudpayments/fail
```

- Метод: `POST`.
- Кодировка: `UTF-8`.
- Прямой Railway hostname не использовать как callback/rollback.
- Остальные CloudPayments notifications текущему runtime не нужны.

## Обязательные настройки

Railway backend:

```text
CLOUDPAYMENTS_PUBLIC_ID=<terminal public id>
CLOUDPAYMENTS_API_SECRET=<terminal api secret>
CLOUDPAYMENTS_ENFORCE_HMAC=true
```

Cloudflare WAF (`Block`, `Enabled`, `First`):

```text
(http.host eq "payments-backend.mojomobile.ru"
 and ip.src ne 185.104.113.237
 and not starts_with(http.request.uri.path, "/.well-known/acme-challenge/"))
```

Timeweb config:
[infra/payment-transport](../../infra/payment-transport/README.md).

## Expected behavior

| Проверка | Результат |
| --- | --- |
| `GET /healthz` | `200` |
| unknown public path | `404` |
| `GET` callback | `405` |
| missing/invalid HMAC | `403` |
| external request к technical backend | Cloudflare `403`, без `X-Railway-Request-Id` |
| Timeweb request к technical backend | Railway response с `X-Railway-Request-Id` |
| valid `Check/Pay/Fail` | backend business response `200` |

Gateway не отвечает `code:0` без backend, не retry-ит callback POST и не
логирует body, HMAC или Authorization.

## Проверка VPS

```bash
curl -fsS https://payments.mojomobile.ru/healthz
ssh esim "nginx -t && systemctl is-active nginx && systemctl is-active certbot.timer"
ssh esim "grep -E 'POST /api/payments/cloudpayments/(check|pay|fail)' /var/log/nginx/payments.mojomobile.ru.access.log | tail -n 30"
ssh esim "tail -n 80 /var/log/nginx/payments.mojomobile.ru.error.log"
```

После изменения nginx отдельно проверить `https://app.mojomobile.ru`.

## Callback result

| Callback | Backend обязан |
| --- | --- |
| `Check` | проверить order, amount и expiry |
| `Pay` | durable сохранить payment result и передать order в canonical fulfillment |
| `Fail` | сохранить decline и release pending holds |

Widget success не означает готовую eSIM. Source of truth — `GET /orders/:id`:
`PAID -> PROCESSING -> COMPLETED`.

## Saved-card

Saved-card transport не production-green. Не повторять charge при
`AMBIGUOUS`, не открывать widget на том же order и не исправлять state SQL.

Support triage keys:

- `orderId`;
- `repeatChargeAttemptId/status`;
- `cloudPaymentsTransactionId`;
- `providerReasonCode/providerMessage`;
- `ambiguousReason`.

План восстановления:
[CloudPayments saved-card recovery](../plans/cloudpayments-saved-card-recovery-plan.md).

## Rollout и rollback

Перед изменением:

1. сохранить working nginx config;
2. выполнить `nginx -t` до reload;
3. проверить HMAC/WAF negative gates;
4. проверить реальный `Check -> Pay` или `Fail`;
5. пройти [Payment Production Checklist](./payment-production-checklist.md).

Прямой Railway callback URL не является rollback. При недоступном gateway
остановить card checkout до восстановления проверенного маршрута; не принимать
платёж без backend decision.

История инцидента:
[CloudPayments connectivity incident 2026-07-11](./cloudpayments-connectivity-incident-2026-07-11.md).
