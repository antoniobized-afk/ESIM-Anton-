# Operations

> [Корневой документ wiki](../README.md)

Операционные инструкции по локальному запуску, деплою и Railway rollout.

## Документы

- [setup.md](./setup.md) — локальный запуск проекта.
- [deployment.md](./deployment.md) — подтвержденный operational baseline и порядок действий перед merge/push в `main`.
- [cloudpayments-runbook.md](./cloudpayments-runbook.md) — какие CloudPayments callbacks реально нужны текущему runtime.
- [payment-production-checklist.md](./payment-production-checklist.md) — pre-deploy и post-deploy smoke checklist для checkout/payment chain.
- [engagement-go-live-checklist.md](./engagement-go-live-checklist.md) — go-live checklist для referrals и loyalty.
- [../architecture/gotchas/data-and-migrations.md](../architecture/gotchas/data-and-migrations.md) — migrations-first правила для существующей Railway БД (`db push` больше не production-стратегия).

