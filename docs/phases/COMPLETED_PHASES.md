[⬅️ К списку фаз](./README.md)

# Завершенные фазы

> Архив фаз, которые завершены и больше не являются активным roadmap.
> Детали реализации остаются в phase-файлах; здесь хранится только навигация и короткий итог.

| #  | Фаза | Статус | Короткий итог | Документ |
| -- | ---- | ------ | ------------- | -------- |
| 0 | Wiki Bootstrap & Legacy Audit | ✅ Завершена | Собран baseline по коду, переписана architecture wiki, зафиксированы расхождения старой документации и реализации. | Отдельный phase-файл в текущем дереве отсутствует |
| 1 | Environment & Config Hardening | ✅ Завершена | Создан безопасный `.env.example`, секреты убраны из документации, setup/deploy docs приведены к подтвержденному runtime. | [phase-1-environment-and-config-hardening.md](./phase-1-environment-and-config-hardening.md) |
| 2 | Runtime Verification | ✅ Завершена | Проверен контур `backend + admin + client + bot`, ключевые user/admin/payment/provider flows и runtime/documentation gaps. | [phase-2-runtime-verification.md](./phase-2-runtime-verification.md) |
| 3 | Admin Auth & API Security Hardening | ✅ Завершена | Закрыты CRITICAL/HIGH security gaps: admin guards, mixed owner/admin routes, service-token bot/internal API, JWT hardening. | [phase-3-admin-auth-and-api-security.md](./phase-3-admin-auth-and-api-security.md) |
| 4 | Loyalty & Referral Wiring | ✅ Завершена | Completion boundary сведена к `OrdersService.fulfillOrder()`, referral bonus и loyalty recalculation подключены к completed purchase. | [phase-4-loyalty-and-referral-wiring.md](./phase-4-loyalty-and-referral-wiring.md) |
| 5 | eSIM Usage, Status & Activation | ✅ Завершена | Сведен eSIM lifecycle для provider snapshot, client/bot status, activation links и low-traffic notification verification. | [phase-5-esim-usage-status-and-activation.md](./phase-5-esim-usage-status-and-activation.md) |
| 6 | Admin Orders, Analytics & Reporting | ✅ Завершена | Доработаны admin orders/reporting контуры, paid revenue definition и cancel/delete policy без потери audit trail. | [phase-6-admin-orders-analytics-and-reporting.md](./phase-6-admin-orders-analytics-and-reporting.md) |
| 7 | Product Catalog Sync & Tariff Metadata | ✅ Завершена | Сверены provider catalog sync/dedupe semantics, отображение tariff metadata в client/admin и backend auth для sync/reprice. | [phase-7-product-catalog-sync-and-tariff-metadata.md](./phase-7-product-catalog-sync-and-tariff-metadata.md) |
| 10 | Client Runtime, Payments & Provider Hardening | ✅ Завершена | Стабилизированы client startup/hydration, order UI, provider/payment logging и минимальный reconciliation path. | [phase-10-client-payments-and-provider-hardening.md](./phase-10-client-payments-and-provider-hardening.md) |
| 11 | Admin Panel Refactoring | ✅ Завершена | Типизированы API/state, добавлены UI primitives, auth layer, App Router patterns, ESLint cleanup и wiki sync. | [phase-11-admin-panel-refactoring.md](./phase-11-admin-panel-refactoring.md) |
| 13 | eSIM Provider Webhook & Real-time Notifications | ✅ Завершена | Реализован provider webhook contour с HMAC, статусными событиями, notification dedupe и cron fallback. | [phase-13-esim-webhook-integration.md](./phase-13-esim-webhook-integration.md) |
| 14 | CloudPayments Tokenized Repeat Payments | ✅ Завершена | Подключен tokenization flow, persistence card token/mask/owner и repeat charge с fallback на новую карту. | [phase-14-cloudpayments-tokenized-repeat-payments.md](./phase-14-cloudpayments-tokenized-repeat-payments.md) |
| 15 | Payment & Webhook Security Hardening | ✅ Завершена | Закрыты repeat-charge idempotency, ambiguous-outcome, payload minimization и degraded webhook auth risks. | [phase-15-payment-and-webhook-security-hardening.md](./phase-15-payment-and-webhook-security-hardening.md) |
| 16 | Partner Referral Links | ✅ Завершена | Добавлены partner referral links, referral compatibility, promo reservation lifecycle, landing `/ref/[code]`, admin CRUD/stats. | [phase-16-partner-referral-links.md](./phase-16-partner-referral-links.md) |
| 17 | Partner Promo Codes | ✅ Завершена | Добавлены owned partner promo codes, reward policy snapshots, shared reward ledger, checkout completion, admin UI и analytics. | [phase-17-partner-promo-codes.md](./phase-17-partner-promo-codes.md) |
| 18 | Account Identity Linking & Merge | ✅ Завершена | Введен durable `UserIdentity`, общий identity resolver, link/unlink flows, duplicate preflight и downstream ownership hardening. | [phase-18-account-identity-linking-and-merge.md](./phase-18-account-identity-linking-and-merge.md) |

## Правило архива

- Не дублировать здесь полный план фазы: source of truth остается в соответствующем phase-файле.
- Если завершенная фаза не имеет отдельного документа, явно писать это вместо сломанной ссылки.
- При закрытии фазы обновлять этот архив и убирать строку из основного [README.md](./README.md).
