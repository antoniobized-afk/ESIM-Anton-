# План: компактная таблица продуктов в админке

Status: planned
Дата: 2026-07-09

## Проверка текущего состояния

- Wiki-маршрут: `docs/README.md` -> `docs/architecture/README.md` -> `docs/architecture/module-map.md`.
- Scope не тянет на фазу: задача локальная для admin `/products`, без изменения backend API, provider sync, pricing rules, public catalog или export contract.
- Ownership текущего списка:
  - `admin/components/products/ProductsTable.tsx` владеет набором колонок и sortable headers.
  - `admin/components/products/ProductsTableRow.tsx` владеет визуальным представлением строки.
  - `admin/components/products/ProductViewModal.tsx` владеет подробностями тарифа.
  - `useProductFilters.ts` и backend `products.sorting.ts` уже владеют URL/sort contract; компактная таблица не должна менять этот контракт.
- Текущая таблица раздута отдельными колонками: provider price, data, duration, cost per GB, our price, markup, speed, country code, data type, badge, status, actions.
- В строках уже есть часть визуальных элементов, но они не сгруппированы: globe emoji вместо country/region indicator, длинный `dataType` label, отдельные широкие колонки для связанных метрик.
- `slug` и `planId` не нужны в основном списке. Они не являются operator-first полями для ежедневной работы с каталогом и раздуют таблицу.
- В `ProductViewModal.tsx` сейчас есть псевдо-`Slug`, построенный из `country`, `dataAmount`, `validityDays`; это отдельная UI-деталь, которую нужно проверить в рамках same-scope cleanup, но не добавлять в таблицу.

## Целевое поведение

- Таблица выглядит как плотный операторский список: меньше горизонтального скролла, ниже визуальный шум, строки читаются быстрее.
- Основной список показывает только данные, нужные для сравнения тарифов:
  - где тариф работает;
  - что это за пакет;
  - сколько стоит у поставщика;
  - сколько стоит у нас;
  - какая маржинальность;
  - активен ли тариф;
  - быстрые действия.
- Подробные идентификаторы, длинные тексты, provider details, notes и прочие вторичные поля остаются в modal/edit/export.
- `slug` и `planId` в таблицу не добавляются.
- Сортировка остается существующей: клики по headers продолжают использовать текущие `sortBy`/`sortOrder`, без переименования backend sort fields.
- Фильтры и URL state не меняются.
- Backend payload не меняется.

## Целевой набор колонок

| Колонка | Содержимое | Sort owner |
| --- | --- | --- |
| Select | checkbox | не сортируется |
| Локация | флаг/region icon, `country` как хранится в базе, короткий код вторым уровнем | `country` |
| Тариф | clickable `name`, tags/badge компактными chips | `name`, `badge` если нужен отдельный header |
| Пакет | `dataAmount` + `validityDays` в одной ячейке с иконками/chips | `dataAmountMb`, `validityDays` |
| Тип | короткий chip по `dataType`, полный label в `title`/modal | `dataType` |
| Поставщик | `$X.XX` и `₽N` в одной ячейке | `providerPrice` |
| Наша цена | `₽N`, ниже `+N%` | `ourPrice`, `markupRatio` |
| ₽/GB | compact metric без строки `по курсу ...` в каждой строке | `providerCostPerGb` |
| Опции | speed/top-up/stock icons или chips, если поле реально есть | не сортируется на старте |
| Статус | Eye/EyeOff toggle + edit icon/action | `isActive` |

Если таблица всё ещё шире нужного, первый кандидат на перенос в modal - отдельная колонка `₽/GB`; она полезна, но не критична для каждого оператора.

## Визуальное решение

1. Локация.
   - Для одиночной страны показывать flag indicator и исходный `country`.
   - Для provider region/global/multi-country значений показывать `Globe2`/`Map` icon из `lucide-react`, не пытаться насильно сделать country flag.
   - Не менять фильтрующее значение и не подменять `country` русским названием без отдельного решения по `country`/`region` contract.

2. Тариф.
   - `name` остается основным clickable текстом и открывает `ProductViewModal`.
   - `badge` и до 2-3 tags показывать маленькими chips под названием.
   - Если tags больше лимита, показывать `+N`, без расширения строки.

3. Пакет.
   - Объединить `dataAmount` и `validityDays` в одну ячейку.
   - Использовать компактные chips: data chip и days chip.
   - Не использовать emoji; для иконок брать `lucide-react` (`Database`, `CalendarDays` или близкие).

4. Цены.
   - Provider price: главный `$X.XX`, secondary `₽N`.
   - Our price: главный `₽N`, secondary markup.
   - Убрать повторяющийся текст `по курсу ...` из каждой строки; курс уже контекст страницы/расчета, не row-level content.

5. Тип и опции.
   - `getProductDataTypeLabel(product.dataType, product.isUnlimited)` остается owner для label.
   - В строке label можно сокращать визуально, но полный текст должен быть доступен через `title` или modal.
   - Speed не должен быть hardcoded `3G/4G/5G`, если в payload есть `product.speed`; fallback chip допустим только если текущий контракт явно предполагает default.

6. Действия.
   - Статус toggle оставить icon-first.
   - Edit оставить icon-only.
   - View открывать кликом по названию или строке, но не добавлять лишнюю колонку `view`, если название уже clickable.

## Шаги внедрения

1. Подтвердить final column set.
   - Принять таблицу из раздела "Целевой набор колонок" как стартовый вариант.
   - Отдельно решить, оставляем ли `₽/GB` в списке или переносим в modal.

2. Product row helpers.
   - Не создавать новый global util.
   - Если helper нужен только для таблицы, держать его рядом с `ProductsTableRow.tsx` или в маленьком product-local файле.
   - Перед добавлением helper проверить существующие owners через `rg` (`country-display`, product data type helpers, pricing helpers).

3. `ProductsTable.tsx`.
   - Сократить header set.
   - Сохранить `SortableHeader` только там, где sort contract уже существует.
   - Не добавлять новые `sortBy` значения.
   - Поджать padding/header text для compact table.

4. `ProductsTableRow.tsx`.
   - Пересобрать строку в grouped cells.
   - Убрать hardcoded visual noise и emoji.
   - Ограничить ширину name/type/tags, чтобы длинные строки не растягивали таблицу.
   - Не менять mutation handlers: select, view, edit, toggle active.

5. `ProductViewModal.tsx`.
   - Проверить псевдо-`Slug`.
   - Если принцип "не показываем slug/planId как operator field" применяем к detail view тоже, убрать `Slug` из modal или заменить на реальное provider/admin поле, которое уже есть в payload.
   - Не добавлять `planId`, если backend его не отдает и операторы его не используют в текущем flow.

6. Browser QA.
   - Проверить desktop width, medium laptop width и mobile/narrow behavior.
   - Убедиться, что таблица не прыгает по высоте, chips не ломают строку, actions доступны.
   - Проверить, что empty/error states не изменились.

## Verification plan

- Admin lint: `pnpm --filter admin lint`.
- Admin build: `pnpm --filter admin build`.
- Diff hygiene: `git diff --check`.
- Manual browser flow:
  - открыть `/products`;
  - проверить первый экран таблицы без горизонтального раздутия;
  - проверить строки с длинным `name`, длинным `dataType`, tags, badge, inactive status;
  - кликнуть sortable headers и убедиться, что URL/sort behavior не изменился;
  - открыть view modal через название;
  - нажать edit и toggle active;
  - проверить narrow viewport, что текст не налезает на соседние элементы.

## Риски и запреты

- Нельзя менять backend API ради визуального уплотнения.
- Нельзя добавлять `slug` и `planId` в таблицу.
- Нельзя подменять `country`/`region` смыслом без отдельного contract decision.
- Нельзя делать локальную сортировку текущей страницы в UI.
- Нельзя заводить parallel helper для pricing/data type, если уже есть shared owner.
- Нельзя оставлять hardcoded `3G/4G/5G`, если рядом есть реальное поле `speed` и оно должно использоваться.
- Если после compact redesign понадобится новая sort column, это отдельное contract change и не входит в этот план.

## Definition of Done

- Таблица визуально компактнее текущей и не добавляет `slug`/`planId`.
- Колонки сгруппированы без потери основных operator metrics.
- Существующие фильтры, сортировка, pagination, selection, edit/view/toggle flows работают как до изменения.
- Admin lint/build пройдены или infra failure явно отделён.
- Результат проверен в браузере, потому что задача визуальная.
