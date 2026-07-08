# План: экспорт продуктов из админки в Excel

Status: planned
Дата: 2026-07-08

## Проверка текущего состояния

- Wiki-маршрут: `docs/README.md` -> `docs/architecture/README.md` -> `docs/architecture/module-map.md`.
- Ownership: backend `products` владеет каталогом, query-фильтрами и sort contract; admin `(admin)/products` владеет UI списка и URL-state.
- `GET /api/products` публичный, потому что его используют `client` и каталог. Admin-only export нельзя добавлять как незащищённое расширение текущего public list.
- `ProductsController.findAll()` принимает `country`, `isActive`, `search`, `tariffType`, `dataType`, `dataAmount`, `dataUnit`, `durationDays`, `sortBy`, `sortOrder`, `paginated`, `page`, `limit`.
- `ProductsService.findAll()` и `findAllPaginated()` уже переиспользуют `buildProductsWhere(filters)` и `buildProductsOrderBy(filters)`.
- `products.filters.ts` владеет list `where`, `products.sorting.ts` владеет normalized `orderBy`, `shared/product-sorting.ts` владеет whitelist/default sort.
- `admin/components/products/useProductFilters.ts` хранит фильтры/сортировку в URL; `useProducts.ts` строит `ProductFilters` для `productsApi.getAll()`.
- `ProductsToolbar.tsx` сейчас содержит действия `Добавить`, `Синхронизировать`, `Обновить`; это правильное место для export action.
- В проекте нет `exceljs`, `xlsx` или `file-saver`. Единственный похожий референс - `admin/components/Orders.tsx`, но там CSV собирается на клиенте из загруженной выборки. Для продуктов такой паттерн не подходит: нужно экспортировать весь filtered dataset, а не текущую страницу.
- `ProductsService` уже около 740 строк, поэтому Excel-формирование нельзя добавлять внутрь него без нарушения `INV-SIZE-1`/`INV-SRP-1`.

## Целевое поведение

- В админке на странице `/products` появляется действие `Экспорт Excel`.
- Без фильтров экспортируется полный каталог продуктов в текущем default order.
- С фильтрами экспортируется весь filtered dataset, а не только текущая страница.
- Сортировка в Excel совпадает с текущим `sortBy`/`sortOrder` в URL и таблице.
- `page` и `limit` не влияют на export: pagination нужна только для UI-таблицы.
- Невалидные `sortBy`/`sortOrder` нормализуются тем же shared whitelist, что и список.
- Endpoint закрыт `JwtAdminGuard`; публичный клиент не получает новый file-export surface.
- Файл скачивается как `.xlsx`, с русскими заголовками и числовыми ячейками для цен/метрик.

## Архитектурное решение

1. Backend генерирует Excel.
   - Не собирать файл в браузере: текущая страница содержит только `limit=50`, а полный export должен соответствовать backend-фильтрам.
   - Добавить dependency `exceljs` в `backend/package.json`.
   - Использовать Nest file response (`StreamableFile` или buffer response с корректными headers) и MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

2. Новый endpoint отдельный и admin-only.
   - Добавить `GET /api/products/export` перед `@Get(':id')` в `ProductsController`.
   - Декораторы: `@UseGuards(JwtAdminGuard)`, `@ApiBearerAuth()`, `@ApiOperation`.
   - Не менять публичный `GET /api/products` в рамках export-задачи, чтобы не сломать client catalog.

3. Новый query DTO вместо inline query debt.
   - Добавить `backend/src/modules/products/dto/product-export-query.dto.ts`.
   - DTO принимает те же filter/sort поля, что admin `ProductFilters`: `country`, `isActive`, `search`, `tariffType`, `dataType`, `dataAmount`, `dataUnit`, `durationDays`, `sortBy`, `sortOrder`.
   - DTO не принимает `page`/`limit` как управляющие параметры export.
   - Boolean/number поля нормализовать через `class-transformer`; whitelist валидировать через `class-validator`.
   - Mapper DTO -> `ProductListFilters` держать product-local, не в generic util.

4. Excel owner внутри products module.
   - Добавить `ProductsExportService` или компактный `products-export.service.ts`.
   - Service инжектит `PrismaService` и переиспользует `buildProductsWhere()` + `buildProductsOrderBy()`.
   - Не дублировать filter/sort SQL/Prisma-логику в export.
   - `ProductsModule` регистрирует `ProductsExportService`.
   - `ProductsService` не расширять Excel-ответственностью.

5. Структура workbook.
   - Лист: `Products`.
   - Freeze header row, autofilter, readable column widths.
   - Колонки по умолчанию:
     - `ID`
     - `Название`
     - `Код страны`
     - `Регион/покрытие`
     - `Описание`
     - `Объём`
     - `Срок, дней`
     - `Duration`
     - `Тип данных`
     - `Скорость`
     - `Цена поставщика, USD`
     - `Цена поставщика, RUB`
     - `Себестоимость / GB, RUB`
     - `Наша цена, RUB`
     - `Наценка, %`
     - `Provider ID`
     - `Provider`
     - `Активен`
     - `Stock`
     - `Бейдж`
     - `Теги`
     - `Top-up`
     - `Создан`
     - `Обновлён`
   - Для labels использовать shared helpers (`getProductDataTypeLabel`) и текущий exchange rate из `SystemSettingsService`, чтобы расчёты соответствовали таблице.
   - Числа писать числами, не строками с `₽`, чтобы Excel мог фильтровать/суммировать.

6. Admin API/download flow.
   - Расширить `productsApi` методом `exportExcel(filters?: ProductFilters)`.
   - Использовать `responseType: 'blob'`.
   - Передавать те же filter/sort params, что и `getAll()`, но без `paginated`, `page`, `limit`.
   - Имя файла брать из `Content-Disposition`, fallback: `products_YYYY-MM-DD.xlsx`.
   - Ошибку blob-response обрабатывать через toast; на `401` должен продолжать работать общий interceptor.

7. Admin UI.
   - В `useProducts()` добавить `exporting` state и `handleExport`.
   - Чтобы не разъехались list/export params, вынести построение `ProductFilters` из `loadProducts()` в product-local helper внутри `useProducts.ts` или соседний маленький helper.
   - `ProductsToolbar` получает `exporting`, `canExport`, `onExport`.
   - Кнопка: `FileSpreadsheet` или `Download` из `lucide-react`, текст `Экспорт Excel`.
   - Disable при `exporting` и при `totalProducts === 0`.
   - После успешного старта скачивания показать короткий success toast; при ошибке - failure toast.

## Шаги внедрения

1. Backend dependency.
   - Добавить `exceljs` в `backend/package.json` через pnpm.
   - Зафиксировать lockfile.

2. Backend export DTO/service.
   - Создать `ProductExportQueryDto`.
   - Создать `ProductsExportService`.
   - Реализовать query через `buildProductsWhere()` и `buildProductsOrderBy()`.
   - Подключить `SystemSettingsService` для exchange rate, если в Excel есть RUB-производные поля.

3. Backend controller.
   - Добавить `GET /products/export` до `GET /products/:id`.
   - Закрыть `JwtAdminGuard`.
   - Вернуть `.xlsx` с корректными `Content-Type` и `Content-Disposition`.

4. Backend tests.
   - Unit-тест export service: применяет filters/sort, не передаёт pagination, маппит labels/numbers.
   - Controller/guard smoke, если текущая тестовая инфраструктура позволяет: без admin JWT endpoint недоступен.
   - Расширить существующие product tests рядом с `products.service.spec.ts` или вынести `products-export.service.spec.ts`, чтобы не раздувать и без того крупный spec сверх разумного.

5. Admin API/types.
   - Добавить `productsApi.exportExcel()`.
   - Если нужен отдельный тип ответа - держать его локальным, не расширять `shared` ради blob.

6. Admin UI.
   - Вынести builder params для list/export.
   - Добавить export state/action в `useProducts`.
   - Добавить кнопку в `ProductsToolbar`.

7. Wiki sync после реализации.
   - Обновить `docs/architecture/module-map.md`: `products` владеет admin Excel export endpoint и export service.
   - Если появится неочевидная gotcha по Blob/error handling или XLSX generation, добавить точечную запись в `docs/architecture/gotchas/`.

## Verification plan

- Backend targeted tests: `pnpm --filter backend test -- products-export.service.spec.ts products.service.spec.ts`.
- Backend build gate: `pnpm --filter backend build`.
- Admin lint/build: `pnpm --filter admin lint` и `pnpm --filter admin build`.
- Consumer audit: `rg -n "productsApi|getAll\\(|/products/export|ProductFilters" admin client backend shared`.
- Manual admin flow:
  - открыть `/products`;
  - экспорт без фильтров;
  - применить `country`, `active`, `dataType`, `data`, `duration`, `search`;
  - выбрать сортировку, например `sortBy=markupRatio&sortOrder=desc`;
  - скачать файл и проверить, что количество строк равно `totalProducts`, порядок совпадает с первыми строками таблицы, а не только с текущей страницей;
  - проверить, что без admin token `/api/products/export` не отдаёт файл.
- Если build падает из-за известного Windows `query_engine-windows.dll.node` lock при Prisma generate, отделить это как infra/harness failure по `INV-VER-3`.

## Риски и запреты

- Нельзя использовать текущий CSV-паттерн `Orders.tsx` как основу: он экспортирует данные из уже загруженного массива и не доказывает полный filtered dataset.
- Нельзя делать client-side refetch с `limit=10000` как основной export-контракт: это скрытая pagination-заплатка и повторение текущего CSV-долга.
- Нельзя оставлять endpoint публичным только потому, что `GET /products` публичный. Excel содержит admin-operational поля и должен требовать admin JWT.
- Нельзя дублировать sort/filter whitelist в отдельной Excel-логике.
- Нельзя добавлять Excel-формирование в `ProductsService`: файл уже большой и смешивает catalog CRUD, sync, bulk operations и dedupe.
- Если нужен export выбранных чекбоксами строк, это отдельный контракт (`ids[]`) и отдельное поведение. В текущий scope входит полный список или текущий filtered/sorted dataset.

## Внешние ссылки, проверенные для реализации

- NestJS Streaming files: https://docs.nestjs.com/techniques/streaming-files
- ExcelJS package: https://www.npmjs.com/package/exceljs
