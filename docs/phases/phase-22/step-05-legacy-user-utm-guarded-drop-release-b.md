# Step 05 — Guarded physical drop и Release B

> [Назад к Phase 22](../phase-22-legacy-user-utm-retirement-and-admin-acquisition.md)

## Цель

Физически удалить legacy User UTM только после совместимого Release A и
повторного zero-data proof, с migration-level защитой от потери данных.

## Что нужно сделать

- Перед merge/deploy Release B повторить read-only aggregate на каждом target
  environment тем же predicate из Step 01.
- Создать новую Prisma migration; initial migration не редактировать и
  `db push` не использовать.
- В migration до `DROP COLUMN` проверить meaningful values и abort-ить весь
  migration при ненулевом результате.
- Ограничить ожидание destructive table lock и сохранять safe failure вместо
  неопределённого старта backend при занятой таблице.
- Удалить transitional Prisma seam Release A и доказать отсутствие трёх полей
  в schema/generated client/physical DB.
- Проверить upgrade с предыдущего полного migration state, а не только fresh
  database replay.

## Результат шага

- Migration проходит на rows с `NULL`/blank legacy values и сохраняет users.
- Meaningful legacy value приводит к fail до первого `DROP`; columns и данные
  остаются на месте.
- После успешного Release B schema, generated client и DB не содержат
  `User.utmSource/utmMedium/utmCampaign`.
- Старый Release A binary продолжает работать во время migration/cutover.

## Зависимости

- Step 04 completed с доказанным полным rollout Release A.
- Повторный zero-data preflight непосредственно перед Release B.

## Статус

`planned`

## Evidence

- Пока отсутствует; production DB и credentials не затрагивались.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/<timestamp>_drop_legacy_user_utm/migration.sql`
- migration/disposable DB verification harness либо documented commands.

## Тестирование / Верификация

- `prisma validate`, `prisma migrate status`, fresh replay и previous-state
  upgrade на disposable PostgreSQL.
- Positive fixture: null/blank UTM -> drop success, user rows preserved.
- Negative fixture: one meaningful field -> migration failure, all columns/data
  preserved.
- Release A binary smoke against post-drop schema.
- `pnpm --filter backend build`; targeted users/auth/bot tests.
- Lookup: `INV-PRISMA-1`, `INV-VER-1..3`, `INV-DOC-1`.
