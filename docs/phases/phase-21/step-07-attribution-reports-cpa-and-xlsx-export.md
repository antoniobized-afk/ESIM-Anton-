# Step 07 — Attribution reports, CPA и XLSX export

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Построить source-backed campaign reporting без вычисления денег из mutable
percent/labels или смешивания cohort, order и ledger facts.

## Что нужно сделать

- Добавить backend report read model with typed date/channel/model filters.
- First/last switch выбирает registration/order snapshot dimension, not current
  user state. Clicks читаются из deduplicated touches; registrations — из
  registration snapshot; purchases/revenue — из completed primary order snapshot.
- Report/read-model queries не используют `User.telegramId`, legacy
  `authProvider/providerId` или текущий contact state для identity/attribution
  join: связь строится только по domain facts (`userId`, touches и immutable
  snapshots).
- Bloggers/CPA view ограничить campaigns with linked `ReferralLink`; payout и
  split читать из successful `REFERRAL_BONUS` ledger/snapshots.
- Явно подписать cohort/event-date semantics в API/UI; no synthetic conversion
  ratio across incompatible date universes.
- Добавить bounded XLSX export in domain-owned service, reusing ExcelJS and
  existing authenticated download pattern, но не product-specific filters/code.

## Результат шага

- Отчёт показывает проверяемые clicks, registrations, first/repeat primary
  purchases, revenue и actual CPA facts for selected attribution model.
- Финансовая витрина не меняется при редактировании campaign label/deactivation
  или current partner policy.
- XLSX содержит только filtered authorized report with row cap and stable
  Russian headers.

## Зависимости

- Steps 03, 04 и 05.
- Step 06 для admin rendering/download action.

## Статус

`planned`

## Evidence

- Pending implementation.

## Файлы

- `backend/src/modules/marketing-attribution/**`
- `admin/components/marketing-attribution/**`
- `admin/lib/{api,types}.ts`
- `backend/package.json` only if existing ExcelJS cannot satisfy the confirmed export contract

## Тестирование / Верификация

- Fixtures prove first vs last dimensions, registration snapshot immutability,
  primary/top-up distinction and campaign deactivation history.
- Fixture с explicit Telegram identity и `User.telegramId = null` даёт те же
  attribution/report facts, что и account с заполненным contact field.
- CPA totals match `REFERRAL_BONUS` ledger and payout mode; no amount derived
  from mutable campaign fields.
- Export validates headers, numeric/date cells, filter parity and row cap.
- Lookup: `INV-TYPE-1`, `INV-PRISMA-1`, `INV-REUSE-1`, `INV-SRP-1`,
  `INV-SIZE-1`, `INV-VER-2..4`.
