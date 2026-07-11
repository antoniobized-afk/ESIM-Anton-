# Payment Transport Infrastructure

Версионированные Timeweb nginx-файлы CloudPayments:

- `timeweb/payments.mojomobile.ru.conf` ->
  `/etc/nginx/sites-available/payments.mojomobile.ru`;
- `timeweb/cloudpayments-callback-proxy.conf` ->
  `/etc/nginx/snippets/cloudpayments-callback-proxy.conf`.

`sites-enabled/payments.mojomobile.ru` должен быть symlink на vhost.
Сертификаты, private keys и secrets в репозиторий не добавляются.

Rollout:

1. сохранить предыдущие remote-файлы с UTC timestamp;
2. установить новые файлы с mode `0644`;
3. выполнить `nginx -t`;
4. только после success выполнить `systemctl reload nginx`;
5. пройти gates из [CloudPayments runbook](../../docs/operations/cloudpayments-runbook.md).

Текущий runtime contract:
[Payment Flow Audit](../../docs/architecture/payment-flow-audit.md).
