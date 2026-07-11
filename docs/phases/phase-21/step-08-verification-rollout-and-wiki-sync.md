# Step 08 — Cross-surface verification, rollout и wiki sync

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Доказать end-to-end contract и оставить runtime/wiki evidence, пригодные для
следующей сессии без повторного reverse engineering.

## Что нужно сделать

- Провести migration preflight/apply plan and rollout-boundary verification.
- Пройти web, bot `start`, Mini App `startapp`, referral/promo/order/report/
  export/manual admin scenarios.
- Выполнить backend/client/admin/bot targeted gates and consumer audit.
- Обновить `module-map.md` after live module lands, relevant auth/referral docs
  при фактическом contract change, phase status/evidence и roadmap lifecycle.
- Distinguish product failure from infra/harness issues; do not claim historical
  report coverage before rollout timestamp.

## Результат шага

- Phase has one demonstrable source-to-CPA path and no unverified migration or
  cross-client contract.
- Docs name real owners, operational limits and rollout start boundary.
- Status is `completed` only after all phase gates and manual scenario pass.

## Зависимости

- Steps 02–07.

## Статус

`completed`

## Evidence

- Migration preflight выполнен на disposable PostgreSQL 16: чистая БД приняла
  все 26 migrations, `prisma migrate status` показал up-to-date schema,
  `prisma validate` green. Три conditional DB-suites (lifecycle, report и
  source-to-CPA) запущены явно и прошли; production БД и credentials не
  затрагивались.
- Добавлен отдельный integrated source-to-CPA DB-spec через production owners:
  anonymous WEB capture/claim регистрирует linked `ReferralLink`, explicit
  Telegram identity при `User.telegramId = null` добавляет более поздний bot
  touch, а registration/order snapshots сохраняют разные FIRST/LAST channels.
  Primary order получает referral reward, manual partner promo второго заказа
  блокирует referral reward и пишет promo-backed ledger row, top-up не получает
  snapshot/accounting. FIRST/LAST channel reports расходятся ожидаемо, CPA
  считает только linked-referral payout, XLSX читает те же DB-backed read models.
- Full backend: 73 suites / 576 tests green; отдельный `nest build` green.
  Canonical backend wrapper до compile по-прежнему может останавливаться на
  локальном Windows Prisma engine lock (`EPERM`), что классифицировано как
  harness failure по `INV-VER-3`, а не code defect.
- Admin lint/build, client lint/type/build и bot build green. В client удалены
  production type/lint bypasses, исправлен единый API-base owner и подтверждён
  реальный generated web link: повторные browser capture requests создали одну
  запись. В admin подтверждены desktop/mobile, generated links/QR, report URL
  refresh/Back/Forward и SUPPORT read-only/`403` role boundary.
- Реальный admin download-flow также подтверждён production builds: кнопка
  `Скачать XLSX` вызвала authenticated export route с `200`, показала success
  toast и сохранила валидный workbook с листами `Атрибуция` и `Блогеры и CPA`.
- Synthetic Telegram runtime дополнил fixtures реальными HTTP routes:
  service-token bot capture/retry дал one touch и one registration snapshot;
  server-verified signed Mini App `initData`/retry прошёл login, durable intent,
  cron capture и cleanup с one touch. Production token и `.env` не читались.
- Consumer audit по backend/admin/client/bot/shared не нашёл параллельного
  marketing owner: web/OAuth consumers используют общий API-base, bot/Mini App
  сходятся в existing capture/lifecycle services, reports/CPA/export читают
  snapshots и ledger. Module map, deployment и runtime rollout boundary
  синхронизированы; synthetic history до rollout timestamp прямо запрещена.
- Cross-domain DB scenario вынесен из narrow report DB-spec в отдельный
  source-to-CPA spec. Расширенный scenario остаётся в бюджете `INV-SIZE-1`
  (481 строка).
  `client/lib/api.ts` остаётся на существующем warning budget в 511
  строк, но новый API-base responsibility вынесен в четырёхстрочный owner и не
  увеличивает mixed responsibility.
- Closure evidence 2026-07-11: оператор подтвердил, что production rollout
  выполнен, Phase 21 работает, а положительные live Telegram flows
  `/start ma_…` и `startapp=ma_…` прошли на настроенном runtime. Это закрывает
  оставшиеся external gates поверх уже зафиксированных DB, browser,
  order/top-up/report/CPA/XLSX и role-boundary проверок; production credentials
  агентом не читались.

## Файлы

- `docs/architecture/{marketing-attribution-runtime,module-map,README}.md`
- `docs/architecture/{auth-identity-runtime,referrals-runtime,promo-codes-runtime}.md` when implementation changes their live contract
- `docs/phases/phase-21*`
- `backend/src/modules/marketing-attribution/marketing-attribution-source-to-cpa.db.spec.ts`
- affected admin/client/bot files and specs

## Тестирование / Верификация

- `pnpm --filter backend build` plus targeted backend tests and Prisma validate.
- Touched `client`/`admin` lint + build; `pnpm --filter bot build`.
- Browser/manual: generated web link, bot start, Mini App startapp, linked
  referral, manual partner promo override, primary order, top-up exclusion,
  report first/last, CPA export and role denial.
- Identity regression: existing account с explicit `TELEGRAM` identity и
  `User.telegramId = null` проходит Mini App `startapp` и linked-referral flow;
  чужая identity или non-null contact drift отклоняются до touch/referral/reward
  write.
- `git diff --check`, markdown link check and consumer audit across backend,
  admin, client, bot and shared.
- Lookup: `INV-VER-1..4`, `INV-DOC-1`, `INV-REUSE-1`, `INV-SRP-1`,
  `INV-SIZE-1`.
