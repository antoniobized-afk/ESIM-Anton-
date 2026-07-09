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

`completed`

## Evidence

- Реализация закрыта 2026-07-09.
- `usersApi.getAll()` переведен на params object
  `{ page, limit, search, sortBy, sortOrder }`; `UserPicker` обновлен на новый
  contract.
- `/users` получил URL-state для `page`, `search`, `sortBy`, `sortOrder`:
  invalid `page` нормализуется, search/sort сбрасывают page, browser
  back/forward сохраняет state через query params.
- Таблица разбита на users-specific components:
  `UsersToolbar`, `UserContactCell`, `IdentityProvidersCell`,
  `UserAttributionCell`, `UserValueCell`, `UserActionsCell`,
  `UserDetailsModal`, общий `user-formatting`.
- Compact list оставлен scan/action surface:
  `Пользователь`, `Вход`, `Атрибуция`, `Баланс`, `Ценность`, `Дата`,
  `Действия`; composite `Пользователь`/Telegram hints не получили sortable
  header.
- Detail modal грузит данные через admin-only `GET /users/admin/:id`
  (`usersApi.getById`) и не расширяет mixed `GET /users/:id`.
- Delete action остается доступен только для `SUPER_ADMIN`; backend blockers
  не обходятся.
- Browser smoke выполнялся через Playwright CLI с mocked admin-safe users API
  без чтения `.env` и без подключения к backend DB:
  - `/users?page=-5&search=%20alisa%20&sortBy=name&sortOrder=asc`
    нормализуется в `/users?search=alisa`;
  - сортировка `Баланс` меняет URL на `sortBy=balance`;
  - строки показывают `Email`/`Telegram` identity chips, `Реферал` и `UTM`
    buckets, loyalty badge, detail modal и copy ID toast;
  - DOM modal/list не содержит `providerSubject`, `metadata`, bot token или
    audit payload;
  - narrow viewport `390px` сохраняет horizontal scroll для таблицы.
- Verification:
  - `pnpm --filter admin lint` — green;
  - `pnpm --filter admin build` — green, есть только существующий Browserslist
    warning про `caniuse-lite`;
  - `git diff --check` — green.
- UI follow-up 2026-07-09: user detail modal переведен на корректный
  body-level modal layer через общий `Modal` portal. Root cause: `fixed`
  overlay рендерился внутри admin content tree и попадал в локальный
  stacking/scroll context; detail modal также открывался проскролленным вниз
  из-за autofocus на footer button. Исправлено:
  - `Modal` рендерится через `createPortal(..., document.body)`;
  - на время открытой модалки body получает `overflow: hidden`;
  - initial focus идет в input/explicit autofocus или сам dialog с
    `preventScroll`, поэтому detail modal открывается сверху;
  - `UserDetailsModal` использует непрозрачный `!bg-white`, как detail modal
    reference в products.
  Verification после follow-up:
  - `pnpm --filter admin lint` — green;
  - `pnpm --filter admin build` — green, только существующий Browserslist
    warning;
  - `git diff --check` — green;
  - Playwright smoke: `overlayParentIsBody=true`, overlay rect совпадает с
    viewport `1280x720`, `bodyOverflow=hidden`, dialog `scrollTop=0`,
    background `rgb(255, 255, 255)`, screenshot
    `output/playwright/phase20-step06-users-modal-final.png`.
- URL-state audit follow-up 2026-07-09: закрыт двойной list fetch при входе на
  `/users` и при смысловой канонизации query params. Root cause: users URL
  normalizer эмитил default `page=1`, а `loadUsers` зависел от `replaceParams`,
  чей identity менялся вместе с `searchParams`. Исправлено:
  - canonical URL не хранит default `page=1` и отдаёт голый pathname при пустом
    query, как reference `useProductFilters`;
  - `replaceParams` читает актуальный `searchParams` через ref, поэтому
    канонизация `?page=1` или default `sortOrder` не пересоздаёт `loadUsers`;
  - reset search/sort/page удаляет `page`, а page correction после backend
    pagination пишет page только когда он больше `1`.
  Verification после follow-up:
  - `pnpm --filter admin lint` — green;
  - `pnpm --filter admin build` — green, только существующий Browserslist
    warning;
  - `git diff --check` — green;
  - Playwright CLI smoke с mocked admin-safe API: `/users` дал ровно один
    `GET /api/users?page=1&limit=20&sortBy=createdAt&sortOrder=desc`;
    `/users?page=1&sortBy=balance&sortOrder=desc` дал ровно один
    `GET /api/users?page=1&limit=20&sortBy=balance&sortOrder=desc`; screenshots
    `output/playwright/phase20-users-bare.png` и
    `output/playwright/phase20-users-canonical.png`.
- Detail modal fetch follow-up 2026-07-09: закрыто дублирование request path в
  `UserDetailsModal`. Root cause: кнопка `Повторить` использовала `loadUser`,
  а mount-effect держал отдельный inline `run()` с тем же
  `usersApi.getById(userId)`. Исправлено:
  - `loadUser` стал единственным fetch-owner для admin-safe detail endpoint;
  - mount-effect вызывает `loadUser` с cancel-guard, чтобы не писать state после
    unmount/userId switch;
  - retry-кнопка вызывает тот же `loadUser` без guard, поэтому error/retry path
    не расходится с initial load.
  Verification после follow-up:
  - `pnpm --filter admin lint` — green;
  - `pnpm --filter admin build` — green, только существующий Browserslist
    warning;
  - `git diff --check` — green;
  - `rg` по `UserDetailsModal.tsx` подтверждает один `usersApi.getById`
    call-site и отсутствие inline `run`.
- Shared Modal consumer follow-up 2026-07-09: закрыт audit risk от изменения
  общего `Modal` на body-level portal/scroll lock. Root cause: предыдущий smoke
  доказывал только users detail modal, хотя primitive используют products,
  promo, referral links, settings и `ConfirmDialog`; после удаления buttons из
  initial focus старый marker `data-modal-close` стал мертвым.
  Исправлено:
  - `data-modal-close` снят с close-button в `Modal`, потому что селектор
    `:not([data-modal-close])` больше не существует;
  - consumer audit подтвердил текущие call-sites:
    `ProductViewModal`, `ProductEditModal`, `BulkBadgeModal`,
    `BulkMarkupModal`, `PromoCodes`, `ReferralLinks`, `Settings`,
    `ConfirmDialog`, `UserDetailsModal`.
  Verification после follow-up:
  - `pnpm --filter admin lint` — green;
  - `pnpm --filter admin build` — green, только существующий Browserslist
    warning;
  - `git diff --check` — green;
  - `rg` по `data-modal-close` и старому selector — no matches;
  - Playwright CLI smoke с mocked API прошёл по
    `ProductViewModal`, `ProductEditModal`, `BulkBadgeModal`,
    `BulkMarkupModal`, `PromoCodeFormModal`, `PromoCodeStatsModal`,
    `ConfirmDialog` через PromoCodes, `ReferralLinkFormModal`,
    `ReferralLinkStatsModal`, `SettingsLoyaltyModal`, `UserDetailsModal`.
    Для каждой модалки подтверждены body-level portal, viewport overlay,
    `bodyOverflow=hidden`, `dialog.scrollTop=0`, focus inside/trap, отсутствие
    `data-modal-close`, Escape close и restore body overflow. Screenshot:
    `output/playwright/phase20-modal-consumers-smoke.png`.
- UserPicker/user-formatting follow-up 2026-07-09: закрыты низкоприоритетные
  audit items по robustness и косметике users UI:
  - `UserPicker` выровнен с users list defensive payload pattern и теперь
    использует `setResults(data.data || [])`;
  - `getAdminUserHint` больше не подставляет `id.slice(0, 12)` fallback,
    потому что ID уже показывается через `getAdminUserDisplayName` fallback или
    отдельный `formatUserShortId`;
  - `UserContactCell` и `UserPicker` не рендерят пустой hint.
  Verification после follow-up:
  - `pnpm --filter admin lint` — green;
  - `pnpm --filter admin build` — green, только существующий Browserslist
    warning;
  - `git diff --check` — green;
  - `rg` подтвердил отсутствие старого `setResults(data.data)` и
    `id.slice(0, 12)` в users hint path.

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
