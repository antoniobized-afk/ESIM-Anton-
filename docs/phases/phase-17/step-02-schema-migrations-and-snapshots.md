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

- `done`

## Реализация

- `PromoCode` расширен nullable partner reward policy:
  - `referralOwnerId`;
  - `referralBonusPercent`;
  - `referralPayoutMode`.
- `PromoCode.referralOwnerId` связан с `User` через `onDelete: Restrict`, чтобы
  партнёрская policy не терялась при наличии исторических/активных контрактов.
- `Transaction` получил nullable `promoCodeId` и relation на `PromoCode` для
  индексируемой аналитики partner promo rewards.
- `PromoCodeRedemption` получил immutable snapshot поля:
  - `rewardOwnerIdSnapshot`;
  - `rewardBonusPercentSnapshot`;
  - `rewardPayoutModeSnapshot`.
- `PromoCodesService.reserveForOrder()` snapshot-ит reward policy с
  залоченной строки `promo_codes`, поэтому последующие admin edits не меняют
  pending/historical order contract.
- Добавлена migration
  `20260529163000_add_partner_promo_policy_snapshots` с nullable полями,
  FK, analytics indexes и raw partial unique index
  `transactions_referral_bonus_once_per_order` для order-level one reward guard.
- Добавлены DTO:
  - `CreatePromoCodeDto`;
  - `UpdatePromoCodeDto`;
  - `PartnerRewardPolicyComplete` validator.
- Backend create/update contract теперь запрещает частично заполненную reward
  policy. Снятие owner в update очищает `referralBonusPercent` и
  `referralPayoutMode`.
- `GET /promo-codes` и update response включают безопасный owner summary для
  будущего admin UI.
- `admin/lib/types.ts` и `admin/lib/api.ts` получили typed partner promo fields
  и `promoCodesApi.update(...)`.

## Backward compatibility

- Существующие `promo_codes` остаются обычными промокодами, потому что все
  partner fields nullable.
- Существующие `promo_code_redemptions` не получают fake snapshots.
- Существующие `transactions` остаются без `promoCodeId`.
- Public/client validation не отдаёт owner metadata; user-context decisions
  остаются в `orders/quote` и `orders` paths.

## Deferred to Step 3/4

- Resolver, который выбирает `manual partner promo -> referral link fallback`,
  будет добавлен на Step 3.
- Фактическое создание `REFERRAL_BONUS` transaction с `promoCodeId` и payout
  semantics будет добавлено на Step 3.
- Checkout self-reward rejection будет добавлен вместе с resolver/order
  integration, когда есть buyer/order context.

## Журнал изменений

### 2026-05-29

- Step создан с обязательным snapshot-контрактом на `PromoCodeRedemption`.
- Step выполнен: schema/migration/DTO contracts добавлены, reservation snapshot
  работает на уровне `PromoCodesService.reserveForOrder()`, обычные промокоды
  остаются backward-compatible.

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
