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

- Добавлены admin-only routes
  `GET /marketing-attribution/reports/{attribution,cpa,export}` с единым DTO:
  pair `dateFrom/dateTo`, optional `channel`, `FIRST_TOUCH|LAST_TOUCH`, UTC
  half-open interval, rolling 30-day default и hard limit 366 дней. Response
  явно возвращает event-date semantics; межэтапные conversion ratios не
  синтезируются.
- Attribution read model считает clicks по deduplicated touches,
  registrations по immutable registration snapshot и finalized date,
  purchases/revenue по `COMPLETED` primary-order snapshot и completed date.
  First/repeat определяется относительно всей истории completed primary
  orders; top-up и order без durable snapshot не попадают в витрину. Direct
  facts остаются отдельной factual строкой.
- First/last switch меняет только registration/order snapshot columns. Query не
  читает `User.telegramId`, legacy `authProvider/providerId`, current contact
  state или current attribution. Telegram-channel fixture отдельно доказывает,
  что report query не содержит `users`/legacy identity join и не зависит от
  nullable contact field.
- CPA read model показывает только campaigns с immutable linked
  `ReferralLink`. Revenue идёт из выбранного completed order snapshot; reward
  count, payout и split читаются только из successful `REFERRAL_BONUS`, где
  совпадают `orderId` и `referralLinkId`. Manual promo/legacy reward и current
  bonus percent/payout mode не используются как fallback. Actual CPA считается
  только как ledger payout / rewarded primary orders.
- `/analytics` получил рабочие tabs «Отчёт по атрибуции» и «Блогеры и CPA»:
  canonical typed URL-state, compact date/model/channel filters, factual totals,
  dense tables, explicit UTC/event-window note и authenticated XLSX action.
  Деактивированные campaigns продолжают отображать исторические факты.
- XLSX owner переиспользует installed ExcelJS и общий authenticated download
  pattern, создаёт листы `Атрибуция` / `Блогеры и CPA` со стабильными русскими
  headers, numeric/date cells и теми же filters. Общий cap 10 000 строк даёт
  explicit `413` без silent truncation. Общий blob/filename helper вынесен в
  `admin/lib/download.ts` и переиспользуется products export.
- Contract tests: report DTO/query/service/controller/export — 5 suites / 15
  tests; весь marketing contour — 20 suites / 97 tests, 1 DB-suite skipped без
  test database. Проверены first/last dimensions, immutable registration
  columns, primary/top-up boundary, deactivation history, nullable Telegram
  contact independence, exact ledger match, payout split, XLSX filter parity,
  headers, numeric/date cells и row cap.
- Gates: `pnpm --filter backend build`; full backend — 71 suites / 571 tests,
  1 DB-suite skipped; `pnpm --filter admin lint`; `pnpm --filter admin build`.
  Consumer audit по `backend/admin/client/bot/shared` подтвердил единственного
  admin consumer; Prisma schema/package/lock не менялись. Все новые/изменённые
  Step 07 owners ниже `INV-SIZE-1` warning budget.
- Browser smoke не объявлен green/red: dev runtime не исполнил базовый Next
  chunk, а production reload затем был остановлен URL policy in-app Browser.
  Это browser-infra по `INV-VER-3`; code/build/test result green. Visual
  desktop/mobile и back/forward proof остаются в manual cross-surface gate
  Step 08 вместе с незакрытым browser evidence Step 06.

## Файлы

- `backend/src/modules/marketing-attribution/{dto/marketing-attribution-report-query.dto.ts,marketing-attribution-report*,marketing-attribution-reports.controller*}`
- `backend/src/modules/marketing-attribution/marketing-attribution.module*`
- `admin/app/(admin)/analytics/_components/{MarketingReportsPanel,MarketingReportFilters,AttributionReportTable,CpaReportTable,useMarketingAttributionUrlState}.tsx`
- `admin/lib/{api,download,marketing-attribution-report.types}.ts`
- `admin/components/products/useProducts.ts`
- `docs/architecture/marketing-attribution-runtime.md`

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
