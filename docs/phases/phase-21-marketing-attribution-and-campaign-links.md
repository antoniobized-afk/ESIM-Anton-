# Phase 21: Marketing Attribution & Campaign Links

> [Корневой документ wiki](../README.md)

## Цель

Создать проверяемый backend-owned контур маркетинговой атрибуции: campaign
links, trusted touches, immutable first/last snapshots регистрации и заказа,
а также operator workspace для источников трафика, CPA и export.

## Результат

- Изолированный backend-модуль `marketing-attribution` владеет campaigns,
  trusted capture, current attribution, registration/order snapshots, audit и
  read models.
- Admin создаёт и деактивирует campaigns, получает canonical web, bot и Mini
  App links и локальный QR без ручной сборки URL/UTM.
- Web, Grammy `/start` и Telegram Mini App `startapp` создают deduplicated
  trusted touches; anonymous web facts безопасно связываются с canonical user.
- Registration и primary order сохраняют immutable first/last snapshots;
  поздний current touch не переписывает историческую атрибуцию.
- Campaign может делегировать регистрацию существующей `ReferralLink`, но не
  дублирует promo/reward ownership; manual partner promo и top-up boundaries
  сохранены.
- `/analytics` содержит campaigns, first/last attribution reports,
  bloggers/CPA и domain-owned XLSX export с backend role enforcement.
- Production rollout, post-rollout behavior и положительные live Telegram
  transport flows подтверждены оператором; история до rollout не
  синтезируется из legacy данных.

## Архитектурные решения

- Durable ownership, trust boundary, lifecycle, reporting и retention живут в
  [Marketing Attribution Runtime](../architecture/marketing-attribution-runtime.md).
- `MarketingCampaign` не пересекается с outbound
  `TelegramBroadcastCampaign`; campaign code является authoritative input, а
  client UTM — только display data.
- Web capture использует opaque visitor token и backend HMAC/claim; raw
  referrer/IP и cross-domain cookie assumptions не являются attribution truth.
- Bot `start=ma_…` и Mini App `startapp=ma_…` — независимые verified domains;
  canonical Telegram ownership доказывает `UserIdentity`, а не contact field.
- Registration/order reports читают immutable snapshots, не mutable current
  attribution. First/last dimension выбирается явно.
- Referral registration остаётся за `ReferralsService`, reward writes — за
  `PartnerRewardsService`, CPA — за successful ledger facts.
- Campaign mutations разрешены `MANAGER`/`SUPER_ADMIN`; `SUPPORT` имеет
  read-only campaign/report/timeline access с backend enforcement.

## Шаги

1. [Step 01 — Runtime audit и contract lock](./phase-21/step-01-runtime-audit-and-contract-lock.md)
2. [Step 02 — Schema, lifecycle и marketing module foundation](./phase-21/step-02-schema-lifecycle-and-module-foundation.md)
3. [Step 03 — Web capture и registration claim](./phase-21/step-03-web-capture-and-registration-claim.md)
4. [Step 04 — Telegram bot и Mini App trusted capture](./phase-21/step-04-telegram-bot-and-mini-app-capture.md)
5. [Step 05 — Order snapshots и referral boundary integration](./phase-21/step-05-order-snapshots-and-referral-boundary.md)
6. [Step 06 — Admin campaign workspace и user timeline](./phase-21/step-06-admin-campaign-workspace-and-user-timeline.md)
7. [Step 07 — Attribution reports, CPA и XLSX export](./phase-21/step-07-attribution-reports-cpa-and-xlsx-export.md)
8. [Step 08 — Cross-surface verification, rollout и wiki sync](./phase-21/step-08-verification-rollout-and-wiki-sync.md)

## Связанные документы

- [Marketing Attribution Runtime](../architecture/marketing-attribution-runtime.md)
  — текущий технический контракт контура.
- [Referral Runtime](../architecture/referrals-runtime.md) — registration и
  partner-link boundary.
- [Promo Codes Runtime](../architecture/promo-codes-runtime.md) — reservation и
  reward-policy snapshots.
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md) — web и
  Telegram identity trust boundary.

## Статус

✅ Завершена 2026-07-11.
