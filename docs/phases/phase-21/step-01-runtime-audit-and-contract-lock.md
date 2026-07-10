# Step 01 — Runtime audit и contract lock

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Подтвердить live boundaries до проектирования data/API contract и исключить
смешивание marketing attribution с referral, promo, rewards или broadcasts.

## Что нужно сделать

- Сверить `User.utm*`, referral/promo/order schema и all current write paths.
- Проследить web referral landing, bot middleware/`/start`, Telegram Mini App
  auth и all primary-order creation paths.
- Проверить admin users attribution, referral/promo analytics/export и Phase 19
  campaign namespace.
- Зафиксировать target contract в
  `docs/architecture/marketing-attribution-runtime.md` до implementation.

## Результат шага

- Подтверждено, что legacy UTM не является touch history или order snapshot.
- Подтверждено, что `ReferralLink`, `PromoCode` и `PartnerRewardsService`
  сохраняют отдельный financial ownership.
- Подтверждено, что bot `start` и Mini App `startapp` — independent paths.
- Phase может начинать schema work без unexplained campaign-name/API conflict.

## Не входит в scope

- Prisma migration, new endpoint или UI implementation.
- Изменение текущего reward/referral behavior.

## Зависимости

Нет.

## Статус

`completed`

## Evidence

- Live `User` имеет только legacy UTM scalars; `Order` не имеет campaign/touch
  snapshot; current admin read model не создаёт synthetic first/last facts.
- Current referral link mutable until first completed primary order; promo
  reservation and partner reward precedence остаются отдельными contracts.
- Web referral использует `startapp=ref_…`; bot parser принимает только
  `ref_…`; UTM DTO есть, но live bot/client её не передают.
- Phase 19 резервирует `TelegramBroadcastCampaign`, поэтому новый namespace —
  `MarketingCampaign`.
- Target contract создан в
  [Marketing Attribution Runtime](../../architecture/marketing-attribution-runtime.md).

## Файлы

- `backend/prisma/schema.prisma`
- `backend/src/modules/{auth,users,orders,referrals,promo-codes,analytics}/**`
- `client/{app,components,lib}/**`
- `bot/src/{index,api,commands}/**`
- `admin/{app,components,lib}/**`
- `docs/architecture/marketing-attribution-runtime.md`

## Тестирование / Верификация

- Read-only consumer audit через `rg` по UTM, referral, promo, order, Telegram
  start payload и campaign owners.
- Official Telegram docs сверены для `start`/`startapp`, `start_param` и
  server-side `initData` validation.
- Lookup: `INV-OBS-1`, `INV-ARCH-1`, `INV-BND-1`, `INV-REUSE-1`, `INV-VER-4`.
