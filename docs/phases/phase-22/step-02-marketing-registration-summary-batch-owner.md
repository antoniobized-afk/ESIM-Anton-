# Step 02 — Batch owner marketing registration summary

> [Назад к Phase 22](../phase-22-legacy-user-utm-retirement-and-admin-acquisition.md)

## Цель

Добавить в `marketing-attribution` один backend owner, который возвращает
компактную factual registration projection для страницы canonical users без
touch history, N+1 и копирования lifecycle semantics в users/admin.

## Что нужно сделать

- Создать cohesive `MarketingUserRegistrationSummaryService` в существующем
  marketing module и экспортировать его для `UsersModule`.
- Принимать bounded массив unique canonical user ids и выполнять один batch
  read `UserMarketingAttribution` с нужными registration identifiers.
- Вернуть derived states `ATTRIBUTED`, `DIRECT`, `PENDING`,
  `REGISTRATION_NOT_TRACKED`, `NO_STATE` по durable lifecycle markers.
- Для attributed snapshot вернуть first/last representative touch id,
  campaign id/name/code, channel, occurrence и UTM tuple из immutable fields.
- Не читать mutable `MarketingCampaign` для восстановления snapshot labels и
  не включать touch history/source event/visitor identifiers.
- Ограничить input фактическим page limit, дедуплицировать ids и сохранить
  deterministic result map по user id.

## Результат шага

- Один exported owner выдаёт summary для всей страницы за один bounded read.
- Existing account с late touch и без eligibility получает
  `REGISTRATION_NOT_TRACKED`, а не `PENDING`/`ATTRIBUTED`.
- Missing state получает `NO_STATE`; eligible pending — только `PENDING`.
- First/last identity можно сравнить по touch id без label-based dedupe.
- Новый import не создаёт NestJS cycle.

## Зависимости

- Step 01.

## Статус

`planned`

## Evidence

- Пока отсутствует; step открывается после Step 01 data/consumer gate.

## Файлы

- `backend/src/modules/marketing-attribution/marketing-user-registration-summary.service.ts`
- `backend/src/modules/marketing-attribution/marketing-user-registration-summary.service.spec.ts`
- `backend/src/modules/marketing-attribution/marketing-attribution.module.ts`
- typed read-model contract рядом с owner либо в существующем shared owner при
  доказанном reuse.

## Тестирование / Верификация

- Unit tests всех пяти derived states и first/last representatives.
- Query-shape test: один `findMany`, unique bounded user ids, no per-user call.
- Module compile/spec и `pnpm --filter backend build`.
- Lookup: `INV-OBS-1`, `INV-ARCH-1`, `INV-BND-1`, `INV-DI-1`,
  `INV-TYPE-1`, `INV-REUSE-1`, `INV-SRP-1`, `INV-SIZE-1`, `INV-VER-1..2`.
