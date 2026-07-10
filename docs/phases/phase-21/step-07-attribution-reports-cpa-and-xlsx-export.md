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

`completed`

## Evidence

- Нормативный report/filter/CPA/XLSX contract и ownership зафиксированы в
  [Marketing Attribution Runtime](../../architecture/marketing-attribution-runtime.md);
  step не дублирует значения и формулы из wiki.
- Backend report/query/export owners и admin workspace реализованы; audit-pass
  добавил stale-request guard, единый shared report vocabulary/date owner,
  single reward-split aggregation, deterministic campaign ordering, report-scan
  indexes и общие download/Excel helpers без параллельных контрактов.
- XLSX completeness доказана workbook-spec: человекочитаемый referral label и
  canonical code находятся в отдельных колонках. Controller-spec проверяет
  полное значение `Content-Disposition`.
- Новый conditional DB-suite создаёт explicit Telegram identity при
  `User.telegramId = null` и подтверждает одинаковые report facts до/после
  заполнения contact field; без `TEST_DATABASE_URL` suite честно skipped.
- Gates audit-pass: Prisma schema valid; `nest build` green; full backend — 73
  suites / 576 tests, 2 DB-suites skipped; admin lint/build green. Полный backend
  wrapper дважды остановлен до компиляции Windows-lock `query_engine` (`EPERM`),
  поэтому infra failure отделён по `INV-VER-3`, а type-result подтверждён
  отдельным `nest build`.
- Browser smoke не объявлен green/red: dev runtime не исполнил базовый Next
  chunk, а production reload затем был остановлен URL policy in-app Browser.
  Это browser-infra по `INV-VER-3`; code/build/test result green. Visual
  desktop/mobile и back/forward proof остаются в manual cross-surface gate
  Step 08 вместе с незакрытым browser evidence Step 06.

## Файлы

- `backend/src/modules/marketing-attribution/{dto/marketing-attribution-report-query.dto.ts,marketing-attribution-report*,marketing-attribution-reports.controller*}`
- `backend/src/modules/marketing-attribution/marketing-attribution.module*`
- `backend/src/common/utils/excel.ts`
- `backend/prisma/{schema.prisma,migrations/20260710210000_add_marketing_report_scan_indexes/migration.sql}`
- `admin/app/(admin)/analytics/_components/{MarketingReportsPanel,MarketingReportFilters,AttributionReportTable,CpaReportTable,useMarketingAttributionUrlState}.tsx`
- `admin/components/marketing-attribution/UserMarketingTimeline.tsx`
- `admin/lib/{api,download,marketing-attribution-report.types,types}.ts`
- `admin/components/products/useProducts.ts`
- `backend/src/modules/products/products-export.service.ts`
- `shared/marketing-attribution-report.ts`
- `docs/architecture/marketing-attribution-runtime.md`

## Тестирование / Верификация

- Targeted report/export/controller/shared/Excel: 7 suites / 21 tests green,
  conditional report DB-suite skipped без `TEST_DATABASE_URL`.
- Marketing contour: 21 suites / 101 tests green, 2 DB-suites skipped.
- Full backend: 73 suites / 576 tests green, 2 DB-suites skipped.
- Admin: full ESLint и production Next build green.
- Prisma: schema validation green; additive migration не применялась к
  пользовательской БД в рамках локального audit-pass.
- Lookup: `INV-TYPE-1`, `INV-PRISMA-1`, `INV-REUSE-1`, `INV-SRP-1`,
  `INV-SIZE-1`, `INV-VER-2..4`.
