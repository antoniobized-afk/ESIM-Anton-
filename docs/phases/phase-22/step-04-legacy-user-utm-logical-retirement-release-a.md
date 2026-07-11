# Step 04 — Logical retirement legacy UTM и Release A

> [Назад к Phase 22](../phase-22-legacy-user-utm-retirement-and-admin-acquisition.md)

## Цель

Удалить все application reads/writes и transport fields legacy User UTM,
оставив физические columns только как явный bounded seam до совместимого
destructive релиза.

## Что нужно сделать

- Удалить UTM из `FindOrCreateUserDto`, `UsersService.findOrCreate`,
  `TelegramBotIdentityInput` и resolver create data.
- Удалить legacy UTM branch из admin read model, types, formatters и fixtures;
  не затронуть `MarketingCampaign`, touch/snapshot/report/XLSX UTM.
- В Release A пометить три legacy scalar fields как `@ignore`, исключив их из
  generated Prisma Client, но сохранив физические nullable columns до Release
  B; seam проверить на disposable PostgreSQL и удалить в Step 05.
- Добавить boundary regression: неизвестный UTM в service-token DTO
  отклоняется global `forbidNonWhitelisted`, current bot payload проходит.
- Выполнить полный consumer audit и доказать, что Release A backend не
  запрашивает и не пишет legacy columns.
- Развернуть Release A до physical drop и зафиксировать, что все active backend
  instances работают на совместимой версии.

## Результат шага

- В runtime/API/admin/bot contracts нет legacy User UTM.
- Campaign UTM surfaces Phase 21 не изменены.
- Новый Prisma Client не зависит от физических columns, а DB пока сохраняет их
  для безопасного rollout/rollback boundary.
- Release A deployed/observed evidence открывает Step 05; без него Step 05 не
  стартует.

## Зависимости

- Step 01.
- Step 03, чтобы удаление legacy summary не создало пустую/misleading колонку.

## Статус

`planned`

## Evidence

- Repo bot client уже отправляет только Telegram identity/contact fields;
  backend DTO/resolver всё ещё принимают и пишут legacy UTM.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/src/modules/users/dto/find-or-create-user.dto.ts`
- `backend/src/modules/users/{users.service,admin-user-read-model}.ts`
- `backend/src/modules/auth/identity-resolver/**`
- `backend/src/modules/users/**/*.spec.ts`
- `bot/src/{api,user-session}.ts` и bot tests/fixtures при необходимости.

## Тестирование / Верификация

- DTO/controller/service/resolver targeted specs.
- Regression unknown UTM payload -> `400`; canonical bot payload -> success.
- Prisma generate/validate и disposable DB proof, что Release A client не
  выбирает legacy columns при ещё существующих columns.
- Backend build/test, bot build, admin lint/build.
- `rg` consumer audit с разделением legacy User UTM и canonical campaign UTM.
- Runtime health/smoke после полного Release A rollout.
- Lookup: `INV-DTO-1`, `INV-TYPE-1`, `INV-PRISMA-1`, `INV-VER-1..4`.
