# Phase 21: Marketing Attribution & Campaign Links

> [Корневой документ wiki](../README.md)

## Цель

Создать проверяемый backend-owned контур маркетинговой атрибуции: кампании с
короткими web/Telegram ссылками, trusted touches, first/last attribution,
immutable snapshots регистрации и заказа, а также operator screen для
источников трафика и CPA.

## Результат

- Появляется isolated module `marketing-attribution`; generic `Campaign` не
  используется и не пересекается с planned `TelegramBroadcastCampaign` из
  Phase 19.
- Admin создаёт/деактивирует кампании, получает canonical web, bot и Mini App
  ссылки и QR code без ручной сборки URL.
- Web, bot `/start` и Telegram Mini App создают deduplicated trusted touches;
  anonymous web facts безопасно связываются с account после JWT.
- Registration и primary order получают immutable first/last snapshots;
  отчёт не зависит от поздней смены current last touch.
- Campaign может ссылаться на существующую `ReferralLink`, но не дублирует
  PromoCode/reward ownership и не начисляет CPA самостоятельно.
- `/analytics` становится экраном «Источники трафика»: campaigns, attribution
  report, bloggers/CPA и domain-owned XLSX export.

## Оценка

- Размер фазы: `large`
- Ожидаемое число шагов: `8`
- Основные риски:
  - перепутать marketing touch с referral/promo финансовым ownership;
  - записывать Telegram `start_param` из untrusted client state;
  - исказить регистрацию или revenue текущим last touch вместо snapshot;
  - сделать cross-domain cookie предположением при фактическом app runtime;
  - продублировать bot/Mini App touch или CPA reward;
  - синтетически «восстановить» историю из legacy UTM и выдать её за факт;
  - открыть destructive campaign control роли SUPPORT.

## Зависит от

- [Phase 16: Partner Referral Links](./phase-16-partner-referral-links.md)
- [Phase 17: Partner Promo Codes](./phase-17-partner-promo-codes.md)
- [Phase 18: Account Identity Linking & Merge](./phase-18-account-identity-linking-and-merge.md)
- [Phase 20: Admin Users Table Identity & Attribution](./phase-20-admin-users-table-identity-attribution.md)
- [Marketing Attribution Runtime](../architecture/marketing-attribution-runtime.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Promo Codes Runtime](../architecture/promo-codes-runtime.md)
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md)

Phase 19 не является dependency: у неё только naming/semantic boundary,
которую эта фаза соблюдает через `MarketingCampaign` namespace.

## Пререквизиты

- `SITE_URL`, `TELEGRAM_BOT_USERNAME` и existing app route hosting подтверждены
  через `.env.example`/live code; боевые credentials не читаются.
- Existing `ReferralLink`/`PromoCode`/reward ledger не меняются без
  consumer-audit через their owners.
- `auth/telegram/webapp` до первого attribution write проверяет HMAC и
  `auth_date` freshness.

## Архитектурные решения

- Durable contract живёт в
  [Marketing Attribution Runtime](../architecture/marketing-attribution-runtime.md);
  phase не дублирует Prisma/API specification.
- Campaign связывается только с existing `ReferralLink`; no nested frontend
  creation PromoCode/ReferralLink и no duplicated reward fields.
- Registration/order report читают immutable snapshot, current user profile —
  только для support/current-state view.
- Generated campaign code является authoritative; display UTM не превращаются
  в arbitrary client-controlled internal attribution.
- Web capture использует first-party opaque visitor token + backend HMAC/claim,
  не cross-subdomain cookie и не raw referrer/IP.
- `start=ma_…` и `startapp=ma_…` — разные verified flows; `ref_…` остаётся
  referral namespace.
- Campaign mutations: `MANAGER`/`SUPER_ADMIN`; `SUPPORT` read-only; enforcement
  только backend-side. Это не неявный change текущих PromoCodes/ReferralLinks
  permissions; их role hardening требует отдельного consumer audit. New
  endpoint/DTO/auth/migration work следует
  `INV-ARCH-1`, `INV-BND-1`, `INV-DTO-1`, `INV-AUTH-1`, `INV-PRISMA-1` и
  `INV-TX-1`.

## Шаги

1. [Step 01 — Runtime audit и contract lock](./phase-21/step-01-runtime-audit-and-contract-lock.md)
2. [Step 02 — Schema, lifecycle и marketing module foundation](./phase-21/step-02-schema-lifecycle-and-module-foundation.md)
3. [Step 03 — Web capture и registration claim](./phase-21/step-03-web-capture-and-registration-claim.md)
4. [Step 04 — Telegram bot и Mini App trusted capture](./phase-21/step-04-telegram-bot-and-mini-app-capture.md)
5. [Step 05 — Order snapshots и referral boundary integration](./phase-21/step-05-order-snapshots-and-referral-boundary.md)
6. [Step 06 — Admin campaign workspace и user timeline](./phase-21/step-06-admin-campaign-workspace-and-user-timeline.md)
7. [Step 07 — Attribution reports, CPA и XLSX export](./phase-21/step-07-attribution-reports-cpa-and-xlsx-export.md)
8. [Step 08 — Cross-surface verification, rollout и wiki sync](./phase-21/step-08-verification-rollout-and-wiki-sync.md)

## Execution topology

Одна сессия выполняет один step и обновляет его evidence + phase snapshot.

- Step 02 открывает data contract.
- Steps 03, 04 и 05 после Step 02 затрагивают разные entry/runtime paths и
  могут выполняться отдельными сессиями. Step 03 — единственный владелец
  post-JWT web claim в `AuthProvider`; Step 04 не меняет этот файл и передаёт
  Mini App launch через уже проверяемый backend auth flow. Каждый step
  потребляет один marketing owner.
- Step 06 требует stable campaign API; Step 07 требует факты из Steps 03–05.
- Step 08 закрывает phase только после всех consumer/manual flows.
- Для всех следующих шагов подтверждение Telegram subject → canonical user опирается
  на `UserIdentity`; `User.telegramId` остаётся contact/drift field и не может
  становиться auth/ownership fallback в новом attribution code.

## Верификация

- Web: generated campaign URL → anonymous touch → email/OAuth account →
  immutable registration snapshot → primary order snapshot.
- Telegram: `start` и `startapp` independently create one trusted touch,
  respect namespaces and do not duplicate referral/reward effects.
- Financial boundary: linked campaign delegates to `ReferralsService`; manual
  partner promo still wins over referral reward; top-up remains non-commissionable.
- Reporting: first/last switch changes only the chosen snapshot dimension;
  revenue/CPA are backed by completed primary order/ledger facts, not mutable
  campaign fields.
- Automated gates follow `INV-VER-1..4`: Prisma validation/migration preflight,
  targeted backend specs, touched client/admin/bot builds, manual smoke and
  cross-app consumer audit. Infra failure is reported separately per
  `INV-VER-3`.

## Связанные документы

- [Marketing Attribution Runtime](../architecture/marketing-attribution-runtime.md) — target ownership, flows и data lifecycle.
- [Referral Runtime](../architecture/referrals-runtime.md) — existing referral/reward policy.
- [Promo Codes Runtime](../architecture/promo-codes-runtime.md) — reservation и reward snapshots.
- [Phase 19](./phase-19-telegram-broadcasts.md) — reserved broadcast campaign semantics.
- [Phase Authoring Guide](./PHASE_AUTHORING_GUIDE.md) — форма phase/step evidence.

## Статус / Evidence

- Status: `in_progress`
- Current step: Step 05
- Last evidence: Step 05 создал immutable snapshots в обоих primary order path
