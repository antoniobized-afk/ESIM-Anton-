# План: сортировка продуктов в админке

Status: implemented
Дата: 2026-07-07

## Проверка текущего состояния

- Wiki-маршрут: `docs/README.md` -> `docs/architecture/README.md` -> `docs/architecture/module-map.md`.
- Ownership: backend `products` владеет каталогом, sync, bulk operations и query-фильтрами списка; admin `(admin)/products` владеет защищённой страницей продуктов. Для admin state уже зафиксирован паттерн: фильтры/сортировки синхронизируются через `searchParams`.
- Живой UI route тонкий: `admin/app/(admin)/products/page.tsx` рендерит `ProductsPage`, а список ведут `ProductsPage`, `useProducts`, `useProductFilters`, `ProductsTable`, `ProductsTableRow`.
- Сейчас `useProductFilters` хранит в URL только `country`, `active`, `dataType`, `search`, `data`, `unit`, `duration`, `page`. `sortBy`/`sortOrder` отсутствуют.
- `productsApi.getAll()` отправляет `ProductFilters`, где нет sort-контракта.
- `ProductsController.findAll()` принимает фильтры, но не принимает сортировку.
- `ProductsService.findAll()` и `findAllPaginated()` всегда сортируют одинаково: `country ASC`, затем `ourPrice ASC`.
- В таблице продуктов `Data ⇅` и `Duration ⇅` выглядят как сортируемые, но это статичный текст. Уже есть reusable UI reference: `admin/components/ui/Table.tsx` экспортирует `SortableHeader`, а `admin/components/Orders.tsx` использует его с URL-параметрами `sortBy`/`sortOrder`.
- Клиентская сортировка массива `products` будет неправильной, потому что backend отдаёт страницу по `limit=50`; сортировать нужно весь filtered dataset до pagination.

## Целевое поведение

- Default order сохранить совместимым с текущим списком: `country ASC`, `ourPrice ASC`.
- При клике на sortable header:
  - URL получает `sortBy` и, если направление отличается от default для поля, `sortOrder`;
  - `page` сбрасывается на `1`;
  - выделение строк сбрасывается так же, как при смене фильтров;
  - backend сортирует до `skip/take`, а не admin сортирует текущую страницу.
- Невалидные `sortBy`/`sortOrder` нормализуются к default, не пробрасываются в Prisma/raw query.
- Stable tie-breaker обязателен для всех сортировок: после основного поля добавлять `country ASC`, `ourPrice ASC`, `id ASC` или другой явный стабильный порядок.

## Sortable columns

| UI column | `sortBy` | Источник | Политика |
| --- | --- | --- | --- |
| Name | `name` | `EsimProduct.name` | Text ASC/DESC. |
| Цена поставщика | `providerPrice` | `EsimProduct.providerPrice` | Numeric ASC/DESC. |
| Data | `dataAmountMb` | normalized sort key из `dataAmount` | Numeric ASC/DESC; legacy/unlimited/null в конец. |
| Duration | `validityDays` | `EsimProduct.validityDays` | Numeric ASC/DESC. |
| Себестоимость / GB | `providerCostPerGb` | normalized sort key из `providerPrice / dataAmountMb` | Numeric ASC/DESC; неделимые/null в конец. |
| Наша цена | `ourPrice` | `EsimProduct.ourPrice` | Numeric ASC/DESC. |
| Наценка | `markupRatio` | normalized sort key из `ourPrice / providerPrice` | Numeric ASC/DESC; `providerPrice=0` в конец. Курс не влияет на порядок, потому что он общий множитель. |
| Region | `country` | Сейчас в строке отображается `product.country`, не `region` | Text ASC/DESC. Если UI начнёт показывать `region`, sort-контракт нужно переименовать отдельно. |
| Тип | `dataType` | `EsimProduct.dataType` | Provider taxonomy order `1..4`; legacy null в конец. |
| Бейдж | `badge` | `EsimProduct.badge` | Сначала реальные значения, пустые/null в конец; внутри по тексту. |
| Статус | `isActive` | `EsimProduct.isActive` | Default DESC, чтобы активные были первыми; toggle даёт ASC. |

Не сортировать:

- checkbox column;
- Speed, пока строка показывает hardcoded `3G/4G/5G`, а не реальное поле `product.speed`;
- actions column.

## Архитектурное решение

1. Не делать page-local sorting в admin.
   - Причина: pagination уже на backend, local sort даст ложный порядок только внутри текущих 50 строк.

2. Не сортировать `dataAmount` строкой.
   - Строковый порядок ломает `500 MB`, `1 GB`, `10 GB`, `Безлимит`.

3. Для вычисляемых колонок добавить product-owned normalized sort keys.
   - Предпочтительный target-state: Prisma migration с полями вроде `dataAmountMb`, `providerCostPerGb`, `markupRatio` в `EsimProduct`.
   - Owner вычислений держать в `backend/src/modules/products/`, не в generic util.
   - Заполнять ключи во всех write-paths продукта: create, update, provider sync, bulk markup/reprice where affected.
   - Backfill migration должна пересчитать ключи для текущих строк. Для legacy/unlimited значений оставлять `NULL`, а order policy держать `nulls last`.
   - Это дороже, чем raw SQL order expression, но не дублирует filter SQL и сохраняет Prisma pagination/count contract.

4. Sort contract добавить рядом с существующими filters.
   - `backend/src/modules/products/products.filters.ts` расширить или вынести product-local `products.sorting.ts`.
   - Ввести whitelist `ProductSortField`, `ProductSortOrder`, resolver default direction и `buildProductsOrderBy()`.
   - `ProductsController.findAll()` принимает `sortBy`/`sortOrder`, но service доверяет только resolver.
   - `admin/lib/types.ts` расширяет `ProductFilters` теми же `sortBy`/`sortOrder`.

5. Admin UI повторяет существующий локальный паттерн Orders.
   - `useProductFilters` парсит и нормализует `sortBy`/`sortOrder`.
   - `ProductsTable` получает `sortBy`, `sortOrder`, `onSort`.
   - Header cells переводятся на `SortableHeader` для всех полей из таблицы выше.
   - Текстовые `⇅` из `Data`/`Duration` удалить, чтобы состояние показывал reusable header.

## Шаги внедрения

1. Backend sort contract.
   - Добавить product-local список сортируемых полей и pure resolver.
   - Расширить `ProductListFilters`.
   - Обновить `findAll()` и `findAllPaginated()` так, чтобы default остался `country ASC, ourPrice ASC`.
   - Добавить unit-тесты на whitelist, invalid params, default direction и stable tie-breakers.

2. Normalized sort keys для вычисляемых колонок.
   - Добавить Prisma migration.
   - Добавить pure calculator в `backend/src/modules/products/`.
   - Подключить calculator к create/update/sync/bulk price paths.
   - Добавить тесты на `1 GB`, `500 MB`, `Безлимит`, `providerPrice=0`, markup ratio.

3. Admin API/types.
   - Расширить `ProductFilters` в `admin/lib/types.ts`.
   - В `useProducts.loadProducts()` передавать sort params в `productsApi.getAll()`.

4. Admin URL state.
   - Расширить `useProductFilters` parsing/normalization.
   - При смене sort сбрасывать `page`.
   - Добавить sort params в dependencies загрузки и reset selection.

5. Admin table.
   - Использовать `SortableHeader` для sortable columns.
   - Оставить checkbox/actions обычными `TableHeaderCell`.
   - `Speed` оставить обычной колонкой до появления реального data-bound поля.

6. Wiki sync после реализации.
   - Если добавляются Prisma fields или меняется public query contract, обновить профильный owner в wiki: `docs/architecture/module-map.md` для `products.filters.ts`/sort contract.
   - Если обнаружится неочевидная gotcha по derived sort keys, добавить запись в `docs/architecture/gotchas/`.

## Verification plan

- Backend targeted tests: `pnpm --filter backend test -- products.service.spec.ts`.
- Backend build gate: `pnpm --filter backend build`.
- Admin lint/build gate: `pnpm --filter admin lint` и `pnpm --filter admin build`.
- Manual admin flow:
  - открыть `/products`;
  - кликнуть `Data`, `Duration`, `Наша цена`, `Наценка`, `Статус`;
  - проверить, что URL меняет `sortBy`/`sortOrder`, page сбрасывается на `1`, Network уходит на `/api/products?...sortBy=...`;
  - убедиться, что порядок сохраняется при refresh/back-forward и применяется ко всему dataset, а не только текущей странице.

## Риски

- Derived columns без normalized keys легко сделать неверно: UI будет показывать один metric, а backend сортировать другой.
- Prisma migration потребует production-safe deploy через `prisma migrate deploy`; нельзя полагаться на `db push`.
- `dataAmount` legacy strings и unlimited packages должны иметь явную null policy, иначе сортировка будет нестабильной.
- Если в ходе реализации выяснится, что `Region` должен означать `region`, а не `country`, сначала нужно поменять UI/contract wording, а не молча сортировать по другому полю.

## Implementation snapshot

- Добавлен shared sort contract: `shared/product-sorting.ts`; backend `products.sorting.ts` строит Prisma `orderBy`, `GET /products` принимает `sortBy`/`sortOrder`, whitelist и stable tie-breakers.
- Добавлены persisted sort keys: Prisma поля `dataAmountMb`, `providerCostPerGb`, `markupRatio`, migration `20260707143000_add_product_sort_keys`.
- Все product write-paths, которые меняют цену или provider data, пересчитывают sort keys: create/update, sync, bulk markup, reprice.
- Review fix: пустой/whitespace `badge` нормализуется в `NULL` на create/update/bulk badge write-boundary; migration чистит уже существующие пустые `badge`/orphan `badgeColor`, поэтому `badge NULLS LAST` остаётся корректной order policy без raw sorting shim.
- Admin products page хранит sort state в URL, отправляет его в `/products` и использует `SortableHeader` для всех sortable columns.
- Durable wiki sync: `docs/architecture/module-map.md`.
- Проверено: `pnpm --filter backend test -- products.service.spec.ts`; `pnpm --filter backend exec prisma validate`; `pnpm --filter backend exec nest build`. Полный `pnpm --filter backend build` локально блокируется на Windows `EPERM` при rename Prisma `query_engine-windows.dll.node`.
