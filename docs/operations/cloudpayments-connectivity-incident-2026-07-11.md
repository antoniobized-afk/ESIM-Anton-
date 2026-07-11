# Инцидент CloudPayments 2026-07-11

Статус: widget-оплата восстановлена; saved-card transport остаётся открытым.

## Симптом

- Client создавал `PENDING` order и открывал CloudPayments widget.
- CloudPayments отклонял обычную оплату: `Check` не доходил до Railway backend.
- Saved-card attempts сохранялись как `AMBIGUOUS/transport_error` без provider
  transaction id и подтверждённого списания.

## Причина

Timeweb и российские probes устанавливали TCP:443 с Railway backend, но TLS
зависал после ClientHello.

```text
Railway client  69.46.46.106 -> TLS и HTTP 200
Railway backend 69.46.46.48  -> TCP connected, TLS timeout
```

Cross-IP/SNI проверка доказала destination-IP failure:

- backend SNI через `69.46.46.106` завершал TLS и возвращал Railway `404`;
- client SNI через `69.46.46.48` также завершался TLS timeout;
- TLS 1.2 и 1.3 давали одинаковый результат;
- из внешней сети backend IP отвечал быстро.

Backend, PostgreSQL, client order creation и Phase 21 marketing changes не
были причиной.

## Исправление

Прямые CloudPayments callback URL на Railway заменены транспортом через
существующие Timeweb и Cloudflare. Новый VPS и application code не
понадобились.

Текущий контракт и точные настройки:

- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [CloudPayments Runbook](./cloudpayments-runbook.md)
- [Versioned nginx config](../../infra/payment-transport/README.md)

Дополнительно:

- создан отдельный TLS vhost `payments.mojomobile.ru` на Timeweb;
- Railway backend получил technical custom domain через Cloudflare Proxy;
- technical hostname закрыт WAF от источников, кроме Timeweb;
- `CLOUDPAYMENTS_ENFORCE_HMAC` изменён с `false` на `true`;
- missing/invalid HMAC теперь возвращает `403`.

## Production evidence

Timeweb access log после переключения CloudPayments:

```text
2026-07-11 12:21:21 UTC Check -> 200
2026-07-11 12:21:33 UTC Pay   -> 200
source: 87.251.91.164
user-agent: CloudPayment/Webhooks Service 1.0
```

Пользователь подтвердил успешную обычную оплату. Gateway не зафиксировал
`502/504`; `app.mojomobile.ru` сохранил `200` после nginx reload.

Пройденные gates:

- `nginx -t`;
- nginx и `certbot.timer` active;
- renew dry-run для `app` и `payments`;
- external technical hostname blocked Cloudflare WAF;
- Timeweb technical hostname request доходит до Railway;
- public health `200`, unknown path `404`, wrong method `405`;
- missing/invalid HMAC `403`;
- реальный `Check -> Pay` `200`.

## Открытый scope

Saved-card backend всё ещё вызывает CloudPayments token API напрямую из
Railway и получает transport ambiguity. Timeweb достигает token API и получает
ожидаемый unauthenticated `401`, поэтому следующий кандидат — защищённый
outbound relay через существующий VPS.

План: [CloudPayments saved-card recovery](../plans/cloudpayments-saved-card-recovery-plan.md).
