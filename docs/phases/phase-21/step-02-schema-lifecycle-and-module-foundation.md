# Step 02 — Schema, lifecycle и marketing module foundation

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Добавить durable marketing data model и isolated Nest module без backfill-выдумки
или дублирования финансовых owners.

## Что нужно сделать

- Добавить `MarketingCampaign`, append-only `MarketingTouch`, user registration/
  current attribution state, immutable order snapshot и campaign audit.
- Зафиксировать FK/index/delete semantics: campaign history не каскадно не
  исчезает, removable empty user anonymizes/unlinks marketing facts, order
  history остаётся доказуемой.
- Сделать migration и preflight; не materialize records из `User.utm*`, старых
  orders или current referral fields.
- Создать `marketing-attribution` module с разделёнными lifecycle/capture/
  reporting responsibilities, DTOs и backend role policy.
- Генерировать canonical web/bot/Mini App links только из backend config;
  campaign code/UTM tuple/link reference freeze после первого touch.

## Результат шага

- Schema поддерживает historic-first/last и registration/order snapshot без
  новых overloaded User fields.
- New campaign can safely reference existing `ReferralLink`, but no campaign
  field duplicates promo/reward policy.
- Migration проходит на реальной базе без synthetic legacy history.
- Module API имеет admin/public/user/bot boundaries и не создаёт Nest cycle.

## Не входит в scope

- Browser/Telegram capture implementation.
- Existing referral registration or checkout reward policy changes.

## Зависимости

- Step 01.

## Статус

`planned`

## Evidence

- Pending implementation.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/modules/marketing-attribution/**`
- `backend/src/app.module.ts`
- `backend/src/modules/users/user-admin-deletion.service.ts`
- `.env.example`

## Тестирование / Верификация

- Prisma validation, migration preflight и migration apply path.
- Specs: code uniqueness/immutability, activation, referral-link reference,
  first/last compare-and-set, snapshot idempotency, deletion/anonymization.
- Module graph inspection for absent DI cycle; DTO/guard tests for admin/public/
  user/service-token boundaries.
- Lookup: `INV-DTO-1`, `INV-TYPE-1`, `INV-AUTH-1`, `INV-PRISMA-1`, `INV-TX-1`,
  `INV-REUSE-1`, `INV-SRP-1`, `INV-SIZE-1`.
