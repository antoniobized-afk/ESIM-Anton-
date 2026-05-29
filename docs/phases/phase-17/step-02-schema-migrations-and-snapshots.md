# Step 02 — Schema, migrations и snapshot contracts

> [Назад к Phase 17](../phase-17-partner-promo-codes.md)

## Цель

Расширить модель промокодов и ledger-связей так, чтобы partner promo rewards
были финансово аудируемыми, не зависели от будущих правок промокода и не
ломали обычные промокоды.

## Что нужно сделать

- Добавить в Prisma schema nullable partner reward поля для `PromoCode`:
  - owner relation на `User`;
  - `referralBonusPercent`;
  - `referralPayoutMode`.
- Добавить в `Transaction` nullable `promoCodeId` и relation на `PromoCode`.
- Добавить snapshot поля в `PromoCodeRedemption`:
  - `rewardOwnerIdSnapshot`;
  - `rewardBonusPercentSnapshot`;
  - `rewardPayoutModeSnapshot`.
- Добавить индексы для analytics:
  - `PromoCode.referralOwnerId`;
  - `Transaction.promoCodeId`;
  - при необходимости composite index по `promoCodeId/type/status`.
- Сформировать миграцию с backward-compatible defaults:
  - существующие promo rows остаются обычными промокодами;
  - существующие redemptions не получают fake owner snapshots.
- Добавить/обновить DTO validation:
  - owner optional;
  - owner + bonus percent + payout mode валидируются как единый block;
  - снятие owner очищает reward policy.
- Не переименовывать существующий `ReferralPayoutMode` в этой фазе без
  отдельного migration plan. Если имя станет blocking issue, сначала добавить
  ADR.

## Результат шага

- Prisma schema и migration поддерживают обычные и партнёрские промокоды.
- Исторические и pending orders не становятся неоднозначными после admin edits.
- DTO contract не допускает частично заполненную reward policy.

## Зависимости

- Step 01.

## Статус

- `planned`

## Журнал изменений

### 2026-05-29

- Step создан с обязательным snapshot-контрактом на `PromoCodeRedemption`.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/modules/promo-codes/dto/*`
- `backend/src/modules/promo-codes/promo-codes.service.ts`
- `backend/src/modules/promo-codes/promo-codes.controller.ts`
- `admin/lib/types.ts`

## Тестирование / Верификация

- `pnpm --filter backend exec prisma validate`
- `pnpm --filter backend exec prisma generate`
- migration dry-run / local migrate
- unit tests на DTO/service validation:
  - обычный promo без owner валиден;
  - owner без percent rejected;
  - percent без owner rejected;
  - owner removal очищает policy.
