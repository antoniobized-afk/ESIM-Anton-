# Step 06 — Cross-surface verification, rollout и wiki sync

> [Назад к Phase 22](../phase-22-legacy-user-utm-retirement-and-admin-acquisition.md)

## Цель

Доказать сквозной acquisition contract после Release B и закрыть phase только
после фактических transport, UI, migration и documentation gates.

## Что нужно сделать

- Пройти web, bot `/start ma_…` и Mini App `startapp=ma_…` registration flows
  с проверкой users row, detail timeline и immutable snapshots.
- Проверить direct, pending, registration-not-tracked, no-state, referral-only
  и campaign+referral cases на desktop/narrow admin.
- Подтвердить, что later touch меняет current detail, но не registration badge
  в users row.
- Проверить reports/CPA/XLSX на прежних campaign UTM и отсутствие влияния
  retired User fields.
- Выполнить backend/admin/bot gates, Prisma status, consumer audit и
  post-rollout health checks.
- Синхронизировать Marketing Attribution Runtime, module map при фактическом
  появлении нового owner, Phase 20 completed summary только по final current
  state, Phase 22 status и roadmap/archive lifecycle.

## Результат шага

- Один реальный Mini App campaign registration виден в `/users` без прочерка и
  совпадает с detail registration snapshot.
- Campaign + referral показываются одновременно, но остаются разными фактами.
- Все пять marketing states имеют доказанное presentation behavior.
- В коде, Prisma schema, migrations target state и admin contracts нет legacy
  User UTM или transitional seam.
- Phase получает `completed` только после production-authorized migration и
  live Telegram/post-rollout evidence; иначе остаётся `partial`.

## Зависимости

- Steps 02–05.
- Завершённая Phase 21 как действующий marketing attribution owner.

## Статус

`planned`

## Evidence

- Пока отсутствует; локальные baseline tests предыдущего audit не заменяют
  implementation и rollout evidence этой фазы.

## Файлы

- `docs/architecture/{marketing-attribution-runtime,module-map}.md`
- `docs/phases/phase-22*`
- `docs/phases/phase-20-admin-users-table-identity-attribution.md` после
  фактической смены current state.
- затронутые backend/admin/bot specs и browser evidence.

## Тестирование / Верификация

- Backend targeted/full tests и build; admin lint/build; bot build.
- Prisma fresh/upgrade/status и post-drop schema checks.
- Browser desktop/narrow states и query-count proof users list.
- Real web/bot/Mini App registration, later-touch immutability, referral
  coexistence, report/CPA/XLSX regression.
- `git diff --check`, markdown links, `rg` consumer audit.
- Lookup: `INV-VER-1..4`, `INV-DOC-1`, `INV-REUSE-1`, `INV-SRP-1`,
  `INV-SIZE-1`.
