# План: улучшение таблицы пользователей в админке

Status: planned
Дата: 2026-07-08

## Проверка текущего состояния

- Wiki-маршрут: `docs/README.md` -> `docs/architecture/README.md` -> `docs/architecture/module-map.md` -> `docs/architecture/auth-identity-runtime.md`.
- Ownership: backend `users` владеет admin list, bot find-or-create, stats, email update и merge preflight; `auth` владеет `UserIdentity`; admin `(admin)/users` владеет таблицей и URL state.
- `admin/app/(admin)/users/page.tsx` уже тонкий route wrapper, а реальная логика живет в `admin/components/Users.tsx`.
- `Users.tsx` читает только `page`, вызывает `usersApi.getAll(page, 20)` и не использует существующий `search` параметр API.
- `admin/lib/api.ts` для users передает только `page`, `limit`, `search`; `sortBy`/`sortOrder` отсутствуют.
- `UsersController.findAll()` принимает только `page`, `limit`, `search`; `UsersService.findAll()` всегда сортирует `createdAt DESC` и включает только `loyaltyLevel`.
- Табличный reusable `SortableHeader` уже есть в `admin/components/ui/Table.tsx`; живые references: `admin/components/Orders.tsx` и product sorting plan.
- Колонка "Провайдер" сейчас показывает `User.authProvider`, то есть legacy login slot, а не реальные связанные `UserIdentity`.
- Telegram bot path `createTelegramBotUser()` создает `User` с `telegramId`, username/name и UTM, создает `UserIdentity(TELEGRAM)`, но не заполняет `User.authProvider`; поэтому в таблице провайдер может быть `—` даже при реальном Telegram-аккаунте.
- OAuth/email user creation еще пишет legacy `authProvider/providerId`, а explicit link/unlink уже живет в `UserIdentity`; значит legacy поле загрязняет контракт и может быть неполным или устаревшим для аккаунтов с несколькими способами входа.
- `rg` показывает, что `authProvider/providerId` сейчас затрагивают не только admin UI: identity resolver, identity backfill, merge preflight, admin/client types и тесты. Удалять поля можно только после consumer audit и замены оставшихся live consumers на `UserIdentity`.
- Колонка "Источник" сейчас показывает только `User.utmSource`, `utmMedium`, `utmCampaign`. DTO `/users/find-or-create` эти поля принимает, но текущий bot middleware и `/start` их не передают. Реферальная атрибуция живет отдельно (`referredById`, `referralLinkId`) и не является UTM.
- "Уровень" в users table захардкожен как `bg-purple-100 text-purple-700`, поэтому все уровни выглядят одинаково. В `LoyaltyLevel` нет persisted color field.
- Для идентификации пользователя в таблице сейчас мало данных: ID обрезан до 8 символов, имя часто fallback `Пользователь`, email/phone не отображаются, поиска в UI нет.

## Что на самом деле нужно исправить

Этот экран должен отвечать администратору на пять операционных вопросов без догадок:

1. Кто это? Достаточно ли данных, чтобы отличить двух одинаковых "Пользователь"?
2. Через что человек входит в аккаунт? Email, Telegram, Google, Яндекс, VK или несколько способов.
3. Откуда он пришел? UTM, реферальная ссылка, прямой Telegram/start flow или данных нет.
4. Насколько он ценен? Баланс, бонусы, сумма покупок, уровень лояльности.
5. Что можно сделать со строкой? Найти, отсортировать, скопировать ID, удалить только при разрешенном backend condition.

Текущий UI смешивает минимум три разных понятия:

- "Провайдер" = legacy login provider (`User.authProvider`), но после Phase 18 реальный owner входов — `UserIdentity`; legacy поле нужно не поддерживать в UI, а удалить после безопасного audit/migration.
- "Источник" = UTM-поля, но в продукте также есть referral attribution и Telegram start payload; целевая колонка должна называться "Атрибуция".
- "Telegram" = контактный/канальный идентификатор, а не доказательство текущего login provider.

Поэтому реализация должна сначала развести смысл колонок, а уже потом добавлять сортировку и цвета.

## Разбор вопросов по пунктам

### 1. Сортировка по столбцам

Сортировка нужна по всем смысловым scalar columns, где порядок можно честно посчитать на backend до pagination:

- ID;
- имя / отображаемый пользователь;
- Telegram/contact;
- атрибуция;
- баланс;
- бонусы;
- потрачено;
- уровень;
- дата регистрации.

Не делать client-side sort текущей страницы: таблица paginated, поэтому это даст ложный порядок только внутри 20 строк.

По решению: сортировка по колонке "Вход" не нужна. Это relation-derived `UserIdentity[]`, и отдельный read key/projection ради сортировки здесь будет лишним усложнением.

### 2. Почему не везде отображается провайдер

Пустой "Провайдер" сейчас не означает, что у пользователя нет способа входа.

Причина:

- UI читает `User.authProvider`;
- Telegram bot path создает `UserIdentity(TELEGRAM)`, но не обязан заполнять legacy `User.authProvider`;
- explicit link/unlink уже живет в `UserIdentity`, поэтому один пользователь может иметь несколько способов входа;
- `User.authProvider/providerId` — legacy compatibility slot, а не текущий source of truth.

Target-state UI: переименовать колонку "Провайдер" в "Вход" или "Способы входа" и показывать chips только из `UserIdentity`: `Email`, `Telegram`, `Google`, `Яндекс`, `VK`.

Не делать:

- не заполнять `authProvider = 'telegram'` задним числом только ради таблицы;
- не оставлять diagnostic fallback на `authProvider` в admin UI;
- не держать `authProvider/providerId` как параллельную логику, если consumer audit подтвердит, что их можно удалить.

Правильный cleanup path:

1. заменить live runtime consumers на `UserIdentity`;
2. удалить поля из admin/client types и backend DTO/selects;
3. удалить или завершить legacy identity backfill/preflight code, если он уже не нужен после migration;
4. добавить Prisma migration на drop `User.authProvider` / `User.providerId`;
5. обновить `auth-identity-runtime.md`, потому что это durable identity contract change.

### 3. Что сейчас означает "Источник"

Сейчас колонка "Источник" показывает только:

- `User.utmSource`;
- `User.utmMedium`;
- `User.utmCampaign`.

Это не общий источник пользователя. Это только UTM. В текущем bot flow `/users/find-or-create` DTO поддерживает UTM, но middleware и `/start` их не передают, поэтому пустые значения ожидаемы.

Есть отдельные факты, которые нельзя смешивать в одну строку без контракта:

- способ входа: `UserIdentity.provider`;
- Telegram contact/channel: `User.telegramId`, `User.username`;
- UTM attribution: `utmSource`, `utmMedium`, `utmCampaign`;
- referral attribution: `referredById`, `referralLinkId`;
- promo/referral reward source: отдельные promo/referral контракты.

Целевое решение для этого экрана: колонка "Атрибуция" с backend summary, который показывает все найденные факты, а не выбирает один вместо другого:

- `referral` при `referredById/referralLinkId`;
- `utm` при UTM fields;
- `entryChannel` / `direct_telegram` при Telegram user без явной referral/UTM;
- `unknown` только когда нет ни referral, ни UTM, ни понятного entry channel.

Если у пользователя есть и referral, и UTM, UI должен показать оба блока. Summary должно быть backend-owned, чтобы admin не собирал бизнес-смысл из сырых полей сам.

### 4. Цвета уровней

Проблема UI-only: все badges используют один purple class.

Target-state без оверинженеринга:

- один code-owner для presentation policy, например `shared/loyalty-level-presentation.ts`, и тонкие UI-компоненты вокруг него;
- цвет определяется по known seeded names/minSpent или deterministic fallback;
- одинаковый уровень всегда получает один цвет во всех admin/client surfaces, где используется этот owner;
- кастомные уровни не ломают UI.

Не нужно добавлять `color` в Prisma на этом шаге. Persisted color нужен только если админ должен вручную настраивать цвет уровня.

### 5. Как идентифицировать пользователей

Нужно не новый суррогатный ID, а нормальная support-friendly строка:

- короткий ID + copy full `User.id`;
- имя: `firstName lastName`, затем username/email, затем fallback;
- Telegram: `@username` и/или numeric `telegramId`;
- email и phone, если есть;
- identity chips из `UserIdentity`;
- поиск по `id`, `telegramId`, `username`, `email`, `phone`, `firstName`, `lastName`.

Raw `providerSubject` OAuth показывать нельзя: это внутренний identity subject, не человекочитаемый support identifier.

## Target table contract

Таблица остается scan/action surface. Она не должна показывать все поля, которые backend отдает для пользователя. Полная карточка уходит в detail modal по строке/кнопке "Подробнее".

| Колонка | Что показывает | Owner данных | Комментарий |
| --- | --- | --- | --- |
| Пользователь | имя, short id + copy full id, 1-2 contact hints | `User` fields | Убирает одинаковые строки "Пользователь"; ID не занимает отдельную колонку. |
| Вход | compact provider chips | `UserIdentity` | Заменяет неоднозначный "Провайдер"; без сортировки. |
| Атрибуция | compact backend summary | `User` + referrals | Показывает ключевые факты; полный breakdown в modal. |
| Баланс | balance + bonus balance | `User` | Текущий финансовый остаток. |
| Ценность | `totalSpent` + loyalty badge | `User` + `LoyaltyLevel` | Покупательская ценность без отдельной колонки уровня. |
| Дата | registration date | `User.createdAt` | Default sort. |
| Действия | delete для SUPER_ADMIN | backend deletion service | Без сортировки. |

В detail modal переносим:

- полный `User.id`, timestamps, block/status flags;
- все контакты: email, phone, Telegram username/id;
- все `UserIdentity` rows: provider, label, email/displayName, linkedAt, lastLoginAt, canUnlink-like diagnostic flag только если safe;
- полный attribution breakdown: referral owner/link, UTM source/medium/campaign, entry channel, raw diagnostic IDs где это безопасно;
- финансы: balance, bonusBalance, totalSpent, level details, cashback/discount values;
- служебные связи: referredBy/referralLink summary, counts/stats если endpoint уже безопасно отдает или detail loader может догрузить.

Не переносить в таблицу поля только потому, что они появились в DTO. Новое поле по умолчанию идет в detail modal, пока не доказано, что оно нужно для сканирования списка.

## Целевое поведение

- URL `/users` хранит `page`, `search`, `sortBy`, `sortOrder`.
- Default order остается совместимым с текущим поведением: `createdAt DESC`.
- Невалидные `page`, `sortBy`, `sortOrder` нормализуются и не попадают напрямую в Prisma.
- При смене `search` или `sortBy` page сбрасывается на `1`; refresh/back-forward сохраняет состояние таблицы.
- В таблице вместо "Провайдер" показываем "Вход": набор provider chips из `UserIdentity` (`Email`, `Telegram`, `Google`, `Яндекс`, `VK`). Legacy `authProvider` в UI не используется.
- `User.authProvider/providerId` удаляются из runtime/schema, если consumer audit подтверждает, что все живые контуры переведены на `UserIdentity`.
- "Источник" заменяется на "Атрибуция": backend summary по referral + UTM + entry channel / unknown; ячейка показывает все доступные факты.
- В compact user cell показываем email/phone/Telegram hint, чтобы админ мог отличить одинаковых "Пользователь", но полный contact stack уходит в modal.
- ID остается обрезанным для сканирования, но рядом нужен full-id affordance: copy button; полный ID также есть в modal.
- Уровень отображается через единый presentation owner + `LoyaltyLevelBadge`, который дает одинаковый цвет для одного уровня во всех surfaces.
- Подробности открываются через существующий `admin/components/ui/Modal`, например `UserDetailsModal`, без нового drawer framework.

## Sortable columns

| UI column | `sortBy` | Источник | Политика |
| --- | --- | --- | --- |
| Пользователь | `name` / `id` / `telegram` | `firstName`, `lastName`, `username`, `email`, `telegramId`, `id` | Header sort может переключать только один активный key; доп. sort keys доступны через URL/toolbar, если нужны. |
| Атрибуция | `attribution` | backend summary | Сортировка по явному primary rank, display при этом показывает все факты. |
| Баланс | `balance` | `User.balance` | Numeric ASC/DESC. |
| Ценность | `totalSpent` / `loyaltyLevel` | `User.totalSpent`, `loyaltyLevel.minSpent`, `id` | Визуально одна колонка; sortable primary default `totalSpent`, level sort можно оставить в toolbar/URL или отдельным toggle позже. |
| Дата | `createdAt` | `User.createdAt` | Default DESC. |

Не сортировать в первом шаге:

- `Действия`.
- "Вход"/identity chips. По решению сортировка по входу не нужна; не вводить read-model key/projection ради этой колонки.

## Архитектурное решение

1. Добавить users sort contract.
   - Минимальный owner: `shared/user-sorting.ts` для union/defaults/normalizers, потому что query contract одновременно нужен backend и admin.
   - Backend owner mapping: `backend/src/modules/users/users.sorting.ts`.
   - Не делать generic table sorting framework.

2. Расширить backend list contract.
   - `UsersController.findAll()` принимает `sortBy`/`sortOrder`.
   - `UsersService.findAll()` строит `where` и `orderBy` через users-owned helpers.
   - Добавить include/select для `identities` с безопасными полями: `provider`, `email`, `emailVerified`, `displayName`, `linkedAt`, `lastLoginAt`.
   - Не отдавать `providerSubject`, raw metadata и audit payload в admin list.
   - Добавить DTO/serializer для `AdminUserListItem`, чтобы не расширять ответ через `serializeUser(any)` бесконтрольно.

3. Убрать legacy identity slot, если live audit позволяет.
   - Выполнить `rg`/consumer audit по `authProvider/providerId` в backend/admin/client/bot/shared/tests/docs.
   - Перевести live runtime на `UserIdentity` там, где legacy slot еще используется.
   - Удалить legacy поля из response types и UI.
   - Если после замены не остается runtime dependency, добавить Prisma migration на drop `User.authProvider` / `User.providerId`.
   - Если остается только one-off backfill/diagnostic code, закрыть его как migration-time artifact или вынести из runtime, а не держать в обычной логике.

4. Исправить meaning provider/source.
   - `identityProviders` строится из `UserIdentity`; legacy `authProvider/providerId` не используется.
   - `attributionSummary` должен явно разделять независимые buckets:
     - `referral`: `referredById` / `referralLinkId`;
     - `utm`: `utmSource`, `utmMedium`, `utmCampaign`;
     - `entryChannel`: Telegram/direct/unknown;
     - `primaryRank`: порядок для сортировки, не единственный display value.
   - Не записывать новую "source" бизнес-логику в UI. Если нужен настоящий first-touch acquisition source, это отдельный contract change в wiki и write-paths bot/client/referrals.

5. Admin UI.
   - Добавить `UsersToolbar`: поиск, refresh, maybe total count.
   - `Users.tsx` парсит/нормализует `page`, `search`, `sortBy`, `sortOrder` по паттерну Orders/Products.
   - Header cells заменить на `SortableHeader` только для полей из таблицы выше.
   - Добавить `IdentityProvidersCell`, `UserContactCell`, `UserAttributionCell`, `UserValueCell`, `LoyaltyLevelBadge`.
   - Добавить `UserDetailsModal` на существующем `admin/components/ui/Modal`; полные identities/attribution/contacts/finance живут там, а не в строке.
   - Не раздувать `Users.tsx`: если файл пересекает warning по `INV-SIZE-1`, вынести cells/toolbar в `admin/components/users/`.

6. Цвета уровней.
   - Создать единого owner'а presentation policy, например `shared/loyalty-level-presentation.ts`.
   - UI-компоненты (`admin/components/users/LoyaltyLevelBadge.tsx`, при необходимости client badge) используют owner, а не держат локальные color maps.
   - Базовые seeded levels:
     - Новичок: neutral/slate.
     - Бронза: amber.
     - Серебро: sky/slate.
     - Золото: yellow.
     - Платина: violet/indigo.
   - Для custom levels использовать deterministic fallback по `level.id` или `level.name`, чтобы один и тот же уровень всегда был одного цвета.
   - Не добавлять `color` в Prisma без отдельного product/admin requirement на ручное управление цветами.

7. Идентификация пользователя.
   - Поиск UI должен искать по `id`, `telegramId`, `username`, `email`, `phone`, `firstName`, `lastName`.
   - В строке показывать full enough identity stack: имя, email/phone при наличии, Telegram handle/id, identity chips.
   - Для точного support flow добавить copy full `User.id`.
   - Не показывать raw OAuth provider subject в таблице.

## Шаги внедрения

1. Backend sort/list foundation.
   - Добавить `shared/user-sorting.ts`.
   - Добавить `backend/src/modules/users/users.sorting.ts`.
   - Расширить `UsersController.findAll()` и `UsersService.findAll()`.
   - Добавить unit tests на whitelist, invalid params, default order, stable tie-breakers.

2. Backend admin-safe DTO и атрибуция.
   - Вынести serializer из controller-level `serializeUser(any)` для list response.
   - Включить `identities` safe summary.
   - Включить attribution summary без тяжелых relations: referral, UTM и entry channel отображаются вместе, raw IDs допустимы для сортировки/диагностики, display labels должны быть safe.
   - Добавить тест, что `providerSubject` не попадает в list response.
   - Добавить тест, что пользователь с referral + UTM получает оба блока в `attributionSummary`.

3. Legacy identity cleanup.
   - Провести consumer audit `authProvider/providerId`.
   - Удалить UI/API зависимости от legacy fields.
   - Если live runtime больше не зависит от legacy slot, добавить Prisma migration на drop полей и обновить identity docs.
   - Если обнаружится обязательный live consumer, сначала заменить его на `UserIdentity`; не оставлять compatibility shim в admin table.

4. Shared loyalty presentation owner.
   - Добавить единый owner цвета/варианта уровня.
   - Перевести admin users badge на него.
   - Проверить другие loyalty badges и не оставлять новые локальные color maps.

5. Admin types/API.
   - Расширить `AdminUser`, добавить `AdminUserIdentitySummary`, `UsersQueryParams`, `UserSortField/UserSortOrder`.
   - `usersApi.getAll()` перевести с positional args на params object; проверить `UserPicker` consumer.

6. Admin users table и detail modal.
   - Добавить URL search state и toolbar.
   - Подключить `SortableHeader`.
   - Заменить provider/source/value cells на dedicated components.
   - Добавить copy full id и компактные contact hints в строке.
   - Добавить `UserDetailsModal` для полного набора данных; таблица не должна расти при добавлении новых detail-only fields.

7. Wiki sync.
   - Если меняется API/list DTO contract, обновить `docs/architecture/module-map.md` в секции `backend users` / `admin`.
   - Если удаляем `User.authProvider/providerId`, обновить `docs/architecture/auth-identity-runtime.md`: `UserIdentity` становится единственным owner способов входа, legacy slot больше не часть current runtime.

## Verification plan

- Backend targeted tests: `pnpm --filter backend test -- users.service.spec.ts users.controller.spec.ts`.
- Если добавлен отдельный sorting spec: включить его в targeted command.
- Backend build gate: `pnpm --filter backend build`; если Windows Prisma `query_engine-windows.dll.node` даст `EPERM`, отделить как infra failure и дополнительно выполнить `pnpm --filter backend exec nest build`.
- Admin lint/build: `pnpm --filter admin lint`; `pnpm --filter admin build`.
- Consumer audit: `rg -n "usersApi\\.getAll|AdminUser|sortBy|sortOrder|authProvider|providerId|LoyaltyLevelBadge|loyaltyLevel" admin backend client bot shared`.
- Browser/manual:
  - `/users?page=-5` нормализуется в `page=1`;
  - поиск по email/username/id сбрасывает page;
  - клики по `Пользователь`, `Атрибуция`, `Баланс`, `Ценность`, `Дата` меняют URL и Network request;
  - provider chips показываются у Telegram users через `UserIdentity`, без чтения legacy `authProvider`;
  - "Атрибуция" не смешивает способ входа и источник привлечения;
  - "Атрибуция" показывает referral и UTM вместе, если доступны оба факта;
  - attribution empty state не выглядит как ошибка данных;
  - список остается компактным на desktop/mobile; detail-only поля видны в `UserDetailsModal`, а не добавлены отдельными колонками;
  - уровни имеют разные цвета и одинаковый уровень не меняет цвет после refresh.

## Зафиксированные решения

1. Сортировка по "Вход" не нужна.
   - Не создавать read key/projection только ради этой сортировки.
   - Не сортировать по legacy `authProvider`.
2. Legacy `User.authProvider/providerId` нужно удалить, если consumer audit подтверждает безопасность.
   - Не оставлять его как fallback для admin UI.
   - Если есть live dependency, сначала заменить dependency на `UserIdentity`, затем удалять поля.
3. Колонка источника называется "Атрибуция".
   - Она показывает backend summary по referral + UTM + entry channel / unknown.
   - Raw UTM остается частью summary, но не единственным смыслом колонки.
   - Несколько attribution facts отображаются вместе.
4. Цвета уровней принадлежат одному code-owner'у.
   - Не хранить цвета в БД.
   - Не размазывать color map по компонентам.
5. Состав contact stack:
   - в таблице: имя, short id/copy, 1-2 contact hints;
   - в modal: полный email, phone, Telegram handle/id, identities и attribution details;
   - не выводить raw OAuth subject.
6. Promotion в фазу:
   - если берем backend DTO + identities + attribution + admin table + wiki, это phase-sized scope;
   - если оставляем только цвета и scalar sorting, можно выполнить из плана без phase package.

## Риски и границы

- Нельзя лечить пустой "Провайдер" копированием `telegram` в `authProvider`: это усилит legacy drift. Правильный owner — `UserIdentity`.
- Если legacy `authProvider/providerId` можно удалить, его нужно удалить через полноценный consumer audit и migration, а не держать как "на всякий случай".
- Нельзя называть UTM/referral/identity одним "Источник" без явного contract. Это разные факты.
- Сортировка relation-derived identity chips не входит в scope; усложнять схему или query ради нее не нужно.
- Добавление persisted color к `LoyaltyLevel` сейчас избыточно: требование про единое отображение решается единым code-owner'ом.
- Если в ходе implementation users table станет слишком большой, split cells/toolbar надо сделать в том же шаге, а не закрывать как "потом".
