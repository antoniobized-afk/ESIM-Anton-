# Step 06 — Admin users table, toolbar и detail modal

> [Назад к Phase 20](../phase-20-admin-users-table-identity-attribution.md)

## Цель

Перестроить admin `/users` UI под новый backend read model: URL state,
поиск, sortable headers, identity chips, attribution cells, copy ID и
admin-only detail modal должны работать без раздувания `Users.tsx`.

## Что нужно сделать

- Перевести `usersApi.getAll()` на params object:
  - `page`;
  - `limit`;
  - `search`;
  - `sortBy`;
  - `sortOrder`.
- Обновить consumers:
  - `admin/components/Users.tsx`;
  - `admin/components/ui/UserPicker.tsx`;
  - любые новые users components.
- Добавить URL state:
  - invalid `page` нормализуется;
  - search/sort reset page;
  - back/forward сохраняет state.
- Использовать existing primitives:
  - `Table`;
  - `SortableHeader`;
  - `Pagination`;
  - `Button`;
  - `Modal`;
  - `ConfirmDialog`;
  - `Toast`.
- Разбить UI при необходимости:
  - `UsersToolbar`;
  - `UserContactCell`;
  - `IdentityProvidersCell`;
  - `UserAttributionCell`;
  - `UserValueCell`;
  - `UserDetailsModal`;
  - `LoyaltyLevelBadge`.
- В строке показывать:
  - display name;
  - short id + copy full id;
  - email/phone/Telegram hints;
  - identity chips;
  - attribution summary;
  - balance/bonus balance;
  - totalSpent + loyalty badge;
  - date;
  - delete action только для `SUPER_ADMIN`.
- В modal показывать detail-only поля из admin-safe endpoint/read model.
- Не показывать raw OAuth `providerSubject`, raw metadata, bot tokens или
  внутренние audit payloads.
- Не делать sortable header для composite `Пользователь`/Telegram hints:
  `name` и `telegram` в Phase 20 остаются display/search-only. Sortable headers
  ставить только на keys, разрешенные backend sort contract.
- Если `Users.tsx` пересекает `INV-SIZE-1` warning, split выполнить в этом же
  шаге.

## Результат шага

- `/users` отвечает на support questions без догадок.
- URL отражает текущий state таблицы.
- Таблица остается компактной, detail-only данные не превращаются в новые
  колонки.
- Delete flow и backend blockers сохранены.
- `UserPicker` не ломается после перехода `usersApi.getAll()` на params object.

## Не входит в scope

- Новый drawer framework.
- Marketing dashboard/CRM surface.
- Сортировка по `Вход` или computed `Атрибуция`, если Step 01 не утвердил
  отдельный backend rank contract.
- Сортировка по composite `Пользователь` или Telegram hints.

## Зависимости

- Step 02.
- Step 03.
- Step 05.
- Step 04, если UI/API types удаляют legacy fields.

## Статус

`planned`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.

## Файлы

- `admin/components/Users.tsx`
- `admin/components/users/*`
- `admin/components/ui/UserPicker.tsx`
- `admin/lib/api.ts`
- `admin/lib/types.ts`
- `admin/app/(admin)/users/page.tsx` только если route wrapper требует props

## Тестирование / Верификация

- `pnpm --filter admin lint`
- `pnpm --filter admin build`
- Browser/manual smoke:
  - invalid page normalization;
  - search reset page;
  - sort URL/request;
  - identity chips from `UserIdentity`;
  - attribution buckets;
  - detail modal;
  - copy full id;
  - delete blockers;
  - narrow viewport horizontal scroll/no overlap.
- `git diff --check`
- Lookup IDs: `INV-OBS-1`, `INV-SIZE-1`, `INV-SRP-1`, `INV-REUSE-1`,
  `INV-VER-1..2`.
