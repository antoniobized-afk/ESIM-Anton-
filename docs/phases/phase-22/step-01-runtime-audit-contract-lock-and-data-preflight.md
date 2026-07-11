# Step 01 — Runtime audit, contract lock и data preflight

> [Назад к Phase 22](../phase-22-legacy-user-utm-retirement-and-admin-acquisition.md)

## Цель

Доказать границы legacy UTM, зафиксировать compact acquisition contract и не
открывать destructive работу без проверенного состояния данных и consumers.

## Что нужно сделать

- Повторить consumer audit `User.utmSource/utmMedium/utmCampaign` по schema,
  migrations, users/auth, admin, bot, client и shared.
- Проверить все consumers `/users/find-or-create`, включая возможные внешние
  service-token callers; repo bot payload должен оставаться UTM-free.
- Зафиксировать один meaningful-value predicate через
  `NULLIF(BTRIM(column), '') IS NOT NULL` для preflight и migration guard.
- На каждом разрешённом окружении получить только total/per-column counts, не
  читать значения UTM.
- Если count ненулевой, остановить drop path и вынести судьбу данных в
  отдельное product decision; не создавать synthetic touches/backfill.
- Сверить durable contract с Marketing Attribution Runtime и не переписывать
  completed step journals Phase 20/21 как текущий source of truth.

## Результат шага

- Consumer inventory не содержит неизвестного writer/reader либо step честно
  получает `partial`/`blocked` с конкретным owner.
- Для каждого target environment есть timestamped aggregate evidence.
- Zero-data gate сформулирован одним SQL predicate без чтения значений.
- Compact summary states и referral/marketing split не требуют догадок в
  следующих шагах.

## Зависимости

Нет.

## Статус

`planned`

## Evidence

- Durable target предварительно зафиксирован в
  [Marketing Attribution Runtime](../../architecture/marketing-attribution-runtime.md).
- Live repo audit до создания phase нашёл legacy writer только в users/auth
  path; bot client уже не отправляет UTM.
- DB aggregate на target environments ещё не выполнялся и не заявляется.

## Файлы

- `docs/architecture/marketing-attribution-runtime.md`
- `backend/prisma/schema.prisma`
- `backend/src/modules/{users,auth,marketing-attribution}/**`
- `admin/**`, `client/**`, `bot/**`, `shared/**`

## Тестирование / Верификация

- `rg` consumer audit по всем workspaces и migrations.
- DTO/transport audit `/users/find-or-create` и bot API payload.
- Read-only aggregate с total/per-column counts на разрешённых БД.
- Lookup: `INV-ARCH-1`, `INV-BND-1`, `INV-DTO-1`, `INV-TYPE-1`,
  `INV-PRISMA-1`, `INV-VER-4`, `INV-DOC-1`.
