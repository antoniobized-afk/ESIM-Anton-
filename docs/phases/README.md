# Project Phases & Roadmap

> [Корневой документ wiki](../README.md)

> Актуальный roadmap по приведению унаследованного проекта к поддерживаемому состоянию.

## Текущий статус

- [x] **Phase 0: Wiki Bootstrap & Legacy Audit**
  - Собран baseline по коду.
  - Переписана architecture wiki.
  - Зафиксированы расхождения между старой документацией и реализацией.
  - Документ: [phase-0-wiki-bootstrap-and-audit.md](./phase-0-wiki-bootstrap-and-audit.md)

- [x] **Phase 1: Environment & Config Hardening**
  - Создан безопасный `.env.example`.
  - Секреты убраны из `docs/integrations/esim-access.md`.
  - Корневые setup/deploy/docs приведены к подтвержденному runtime.
  - Документ: [phase-1-environment-and-config-hardening.md](./phase-1-environment-and-config-hardening.md)

- [x] **Phase 2: Runtime Verification**
  - Поднять полный контур `backend + admin + client + bot`.
  - Проверить ключевые user/admin/payment/provider flows.
  - Закрыть расхождения между декларативной документацией и фактическим поведением.
  - Клиентские баги трекаются в [../info/bug-resolution.md](../info/bug-resolution.md).
  - Документ: [phase-2-runtime-verification.md](./phase-2-runtime-verification.md)

- [x] **Phase 3: Admin Auth & API Security Hardening**
  - Закрыть все CRITICAL/HIGH уязвимости из security audit 2026-05-08 (3 CRITICAL, 5 HIGH).
  - Guards на все admin-facing endpoints: analytics, system-settings, users, payments, products, orders, esim-provider.
  - Mixed client/admin routes закрываются через `admin OR owner`, а не blind admin-only.
  - Bot/internal `find-or-create` требует service-token, не admin JWT.
  - Защита `register-admin` + IDOR fix в `updateMyEmail`.
  - Усиление JWT: `type: 'admin'`, whitelist ролей, TTL 24h.
  - Admin login flow уже работает (шаги 1-2 подтверждены). 6 шагов, ~4-5ч.
  - Документ: [phase-3-admin-auth-and-api-security.md](./phase-3-admin-auth-and-api-security.md)

- [x] **Phase 4: Loyalty & Referral Wiring**
  - Completion boundary сведена к `OrdersService.fulfillOrder()` для card, balance и free-order purchase flows.
  - Referral bonus подключён к completed purchase, читает runtime settings из `SystemSettings` и защищён от повторного начисления по `orderId`.
  - После роста `totalSpent` выполняется пересчёт `loyaltyLevel`; top-up flow отдельно исключён из этих side effects.
  - Документ: [phase-4-loyalty-and-referral-wiring.md](./phase-4-loyalty-and-referral-wiring.md)

- [x] **Phase 5: eSIM Usage, Status & Activation**
  - Подтвердить реальный provider contract для `getEsimSnapshot()` и `purchaseEsim()` на контролируемом заказе.
  - Довести единый lifecycle `backend -> client -> bot` для usage, статусов, LPA/QR и top-up readiness.
  - Проверить low-traffic monitoring cron и Telegram delivery на реальном или воспроизводимом сценарии.
  - Документ: [phase-5-esim-usage-status-and-activation.md](./phase-5-esim-usage-status-and-activation.md)

- [x] **Phase 6: Admin Orders, Analytics & Reporting**
  - Доработать admin orders table, которая пока показывает только базовые поля без promo/discount/export.
  - Вынести формулу `paid revenue` и проверить, что dashboard/analytics не расходятся с business definition.
  - Зафиксировать policy для cancel/delete без потери audit trail.
  - Документ: [phase-6-admin-orders-analytics-and-reporting.md](./phase-6-admin-orders-analytics-and-reporting.md)

- [x] **Phase 7: Product Catalog Sync & Tariff Metadata**
  - Сверить catalog metadata с уже существующим `ProductsService.syncWithProvider()` и dedupe flow.
  - Довести отображение `tags`, `notes`, `region`, `supportTopup` и различий похожих тарифов в client/admin.
  - Зафиксировать безопасные semantics для sync/reprice/dedupe и закрыть их backend auth.
  - Документ: [phase-7-product-catalog-sync-and-tariff-metadata.md](./phase-7-product-catalog-sync-and-tariff-metadata.md)

- [ ] **Phase 8: API Security Infrastructure (Helmet, CORS, DTO, Rate Limiting)**
  - Security headers через `helmet`, CORS с явными admin/client origins, Swagger скрыт в production.
  - DTO с `class-validator` для всех external write endpoints вместо `@Body() dto: any`.
  - Rate limiting (`@nestjs/throttler`): 5 login / 3 SMS в минуту, webhooks исключены, proxy/distributed risks зафиксированы.
  - Зависит от Phase 3 (guards + JWT). 4 шага, ~3-4ч.
  - Документ: [phase-8-api-security-infrastructure.md](./phase-8-api-security-infrastructure.md)

- [x] **Phase 10: Client Runtime, Payments & Provider Hardening**
  - Стабилизировать startup orchestration в `client` без массовой SSR/RSC migration.
  - Исправить подтверждённый UI bug на `order/[id]` и выровнять hydration-sensitive route patterns.
  - Сократить provider/payment logging surface и зафиксировать production-safe baseline.
  - Добавить minimal reconciliation/visibility path для сценариев paid-but-not-fulfilled.
  - В wiki закреплены rollout guardrails: без возврата blind timeout coordination, raw payload logging по умолчанию, sweeping SSR/RSC migration и speculative reconciliation platform внутри этой фазы.
  - Документ: [phase-10-client-payments-and-provider-hardening.md](./phase-10-client-payments-and-provider-hardening.md)

- [x] **Phase 11: Admin Panel Refactoring**
  - Типизация API и state (устранение `any`), декомпозиция God-компонентов.
  - UI-примитивы (`Button`, `Modal`, `Toast`, `ConfirmDialog`) и замена `alert()`/`confirm()`.
  - Auth-слой (`AuthProvider` + `AuthGuard`), переход на App Router с URL search params.
  - ESLint setup, cleanup dead CSS/deps, обновление wiki.
  - Зависит от Phase 3 (auth guards), Phase 6 (orders table). 7 шагов.
  - Документ: [phase-11-admin-panel-refactoring.md](./phase-11-admin-panel-refactoring.md)

- [ ] **Phase 12: Client PWA & Telegram Mini App Refactoring**
  - Декомпозиция god-pages (6 страниц >15 KB), унификация auth-flow, устранение 29 `any`, замена 10 `alert()` на Toast UI.
  - Замена `window.location` на SPA-навигацию, добавление `error.tsx`/`loading.tsx` boundaries.
  - Вынос юридических текстов в `.md` файлы (Server Components), подключение Tailwind design tokens.
  - Убраны `ignoreBuildErrors`/`ignoreDuringBuilds` (билд чист).
  - Зависит от Phase 10 (client runtime), Phase 11 (референс паттернов). 6 шагов.
  - Документ: [phase-12-client-refactoring.md](./phase-12-client-refactoring.md)

- [x] **Phase 13: eSIM Provider Webhook & Real-time Notifications**
  - Переход от pull-модели (задержка API провайдера 1-3 часа) к push-модель (webhooks).
  - Защита публичного webhook endpoint через HMAC-SHA256 и защиту от timing-атак.
  - Умные уведомления по % использованного трафика, дедупликация спама.
  - Гибридная модель с fallbacks через cron.
  - Документ: [phase-13-esim-webhook-integration.md](./phase-13-esim-webhook-integration.md)

- [x] **Phase 14: CloudPayments Tokenized Repeat Payments**
  - Включить реальный tokenization flow в текущем CloudPayments widget и захватывать token после первой оплаты.
  - Добавить минимальную persistence-модель для `token + mask + owner` и repeat charge через CloudPayments API для purchase flow.
  - Добавить production-grade checkout/orchestration contour для оплаты привязанной картой и безопасный fallback на новую карту без построения полноценной saved-cards platform, сохранив extension seam для будущего top-up / balance-topup.
  - Runtime baseline Phase 14 подтверждён, а все выявленные security/reconciliation follow-up риски вынесены и закрыты в отдельной Phase 15.
  - Документ: [phase-14-cloudpayments-tokenized-repeat-payments.md](./phase-14-cloudpayments-tokenized-repeat-payments.md)

- [x] **Phase 15: Payment & Webhook Security Hardening**
  - Убрать double-charge и ambiguous-outcome риски в saved-card repeat charge после Phase 14.
  - Сузить surface хранения и выдачи чувствительных CloudPayments payloads и token-related данных.
  - Усилить degraded-auth path у eSIM Access webhook без потери live provider compatibility.
  - Зафиксировать reconciliation/runbook baseline для payment/webhook security follow-up.
  - Документ: [phase-15-payment-and-webhook-security-hardening.md](./phase-15-payment-and-webhook-security-hardening.md)

- [ ] **Phase 16: Partner Referral Links**
  - Добавить партнёрские реферальные ссылки с индивидуальным `bonusPercent`, сроком жизни, optional promo code и аналитикой.
  - Сохранить обратную совместимость с текущим user-to-user referral flow: `ReferralLink.code` lookup идёт перед fallback на `User.referralCode`.
  - Реализовать безопасный auto-promo lifecycle через `PromoCodeRedemption(RESERVED -> CONSUMED/RELEASED)` с row-locked capacity check по `maxUses`.
  - Добавить web landing `/ref/[code]`, one-shot `AuthProvider` integration, admin CRUD/stats UI и обновить `referrals-runtime.md`.
  - Документ: [phase-16-partner-referral-links.md](./phase-16-partner-referral-links.md)
