# План: retirement legacy User UTM и ясная marketing attribution в карточке пользователя

Status: superseded
Дата: 2026-07-11

План после audit и contract lock перенесён в
[Phase 22](../phases/phase-22-legacy-user-utm-retirement-and-admin-acquisition.md).
Этот supporting-файл больше не владеет scope, порядком реализации или
Definition of Done.

## Проблема

В репозитории существуют две несовместимые модели UTM:

- legacy поля `User.utmSource`, `User.utmMedium`, `User.utmCampaign`, созданные
  в исходной схеме и передаваемые старым Telegram `find-or-create` path;
- канонические поля `MarketingCampaign.utm*`, из которых Phase 21 создаёт
  trusted `MarketingTouch`, current state и immutable registration/order
  snapshots.

Legacy `User.utm*` не являются историей касаний, не участвуют в Phase 21 и,
по подтверждённому product context, не содержат полезных данных. При этом
старый admin summary назывался «Атрибуция» и мог показывать «Прямой вход» по
наличию email/identity, то есть выдавал способ логина за источник трафика.
Это создаёт прямое противоречие с factual `Marketing timeline`.

## Проверенное текущее состояние

- `User.utmSource`, `User.utmMedium`, `User.utmCampaign` находятся в
  `backend/prisma/schema.prisma` с initial migration
  `20260507_init`.
- Legacy writer остаётся в цепочке `FindOrCreateUserDto` ->
  `UsersController` -> `UsersService.findOrCreate` ->
  `AuthIdentityResolverService.resolveTelegramBotUser`.
- `ADMIN_USER_READ_MODEL_INCLUDE` и `admin-user-read-model.ts` читают
  `User.utm*` для `attributionSummary`; admin list и detail modal показывают
  этот summary.
- Phase 21 не копирует `MarketingCampaign.utm*` в `User.utm*` и не должен это
  делать: campaign UTM принадлежат `MarketingCampaign` и попадают в touch/
  snapshot только через trusted capture.
- Отдельный admin endpoint
  `GET /marketing-attribution/users/:userId/timeline` уже корректно отдаёт
  current first/last, immutable registration snapshots и campaign UTM по
  canonical `User.id`.

## Целевое поведение

1. `MarketingCampaign` остаётся единственным владельцем campaign UTM. Поля
   campaign/touch/snapshot/report/XLSX не меняются и продолжают показывать
   `source / medium / campaign`, например `insta / social / my`.
2. `User.utm*` и legacy bot UTM input полностью удаляются после подтверждения,
   что в БД нет значений. Новый bot registration создаёт только trusted
   `TELEGRAM_BOT` touch через Phase 21 owner.
3. В compact users table не остаётся колонка, которая называет способ входа
   или устаревшее поле «Атрибуцией». Referral остаётся отдельным фактом и
   показывается как `Реферал`/`—`, без UTM и без inference из identity.
4. В user detail главным источником campaign данных становится явно названная
   русскоязычная секция `Маркетинговая атрибуция`:
   - сначала verdict регистрации (`По кампании` / `Прямой` / `Ожидает`);
   - для attributed registration — campaign name/code, channel и UTM tuple;
   - отдельно current first/last и factual history, чтобы оператор видел
     разницу между immutable registration snapshot и последующими касаниями;
   - одинаковые first/last не создают четыре визуально равноправные карточки
     без пояснения их разных временных смыслов.
5. Старый `attributionSummary` не расширяется campaign полями: list API не
   получает N+1 marketing projection, а factual marketing contract остаётся
   за отдельным Phase 21 endpoint.

## План реализации

### 1. Preflight данных и contract lock

1. На каждом целевом окружении выполнить read-only aggregate без чтения
   значений: число строк, где хотя бы одно из `User.utm*` не `NULL`/не пусто.
2. Если счётчик не равен нулю, не применять drop migration: зафиксировать
   число и отдельно согласовать судьбу исторических значений.
3. До кода обновить durable docs:
   - `docs/architecture/marketing-attribution-runtime.md`: `MarketingCampaign`
     — единственный owner campaign UTM; `User.utm*` retired, не источник
     history и не backfill source;
   - Phase 20 root и Step 03: users UI больше не владеет UTM/entry-channel
     attribution summary;
   - Phase 21 Step 06: operator view объясняет registration snapshot vs
     current touch и использует factual campaign UTM.

### 2. Удаление legacy UTM write/API surface

1. Удалить `utmSource`, `utmMedium`, `utmCampaign` из `User` в Prisma schema.
2. Создать новую Prisma migration с `DROP COLUMN` только после successful
   preflight. Не редактировать initial migration и не использовать `db push`.
3. Удалить UTM из `FindOrCreateUserDto`, bot-facing `/users/find-or-create`
   contract, `UsersService.findOrCreate`, `TelegramBotIdentityInput` и
   `AuthIdentityResolverService` create data.
4. Проверить bot API client и все bot call-sites: payload должен содержать
   только canonical Telegram identity/contact fields; campaign attribution
   продолжает передаваться исключительно в service-token capture endpoint.
5. Удалить legacy UTM unit/controller/DTO fixtures и добавить regression:
   bot user creation не может записать произвольный UTM tuple в `User`.

### 3. Замена admin users presentation contract

1. Заменить `attributionSummary` на узкий referral-only read model либо
   удалить его из list contract, если отдельная колонка `Реферал` уже даёт
   оператору достаточный сигнал. Не оставлять generic название
   `Атрибуция` для неполного источника.
2. Обновить backend `admin-user-read-model.ts`, `UsersService`, admin API
   types и все list/detail consumers синхронно.
3. Удалить fallback `Telegram`/`Прямой вход`/`Неизвестно` из traffic-source
   presentation. Identity остаётся только в существующей колонке `Вход`.
4. Сохранить referral link/code/owner как factual operator context; не
   дублировать campaign или reward policy в users list.
5. Обновить backend tests так, чтобы email/Telegram identity без referral не
   порождала source label, а referral продолжал отображаться.

### 4. Ясная Phase 21 timeline в detail modal

1. Переименовать `Marketing timeline` в `Маркетинговая атрибуция` и перевести
   operator labels на русский язык.
2. Добавить короткий registration summary над деталями: статус, campaign,
   channel и `utm_source / utm_medium / utm_campaign` из immutable snapshot.
3. Сгруппировать current first/last как «Текущие касания», а registration
   first/last как «На момент регистрации». Если representatives совпадают,
   показать это одной объяснённой карточкой, не дублировать одинаковый факт.
4. Сохранить existing bounded timeline endpoint и pagination touch history;
   не тянуть marketing relations в `GET /users` или `GET /users/admin/:id`.
5. Проверить empty, direct, pending, attributed и post-registration later-touch
   состояния в desktop и narrow modal layout.

### 5. Миграция и rollout

1. Прогнать migration на disposable PostgreSQL с пустыми legacy UTM и проверить
   `prisma migrate status`/`prisma validate`.
2. Перед production deploy повторить preflight aggregate на разрешённом
   окружении. Если он зелёный, применить только `prisma migrate deploy`.
3. После deploy создать campaign `insta / social / my`, пройти web и bot
   регистрации и проверить:
   - user row не называет login «прямым переходом»;
   - detail показывает campaign UTM из registration snapshot;
   - later touch меняет только current view;
   - reports/CPA/XLSX сохраняют те же campaign UTM и метрики.

## Verification plan

- Backend focused tests: users DTO/controller/service, auth identity resolver,
  bot API, marketing lifecycle/timeline/report services.
- Backend build: `pnpm --filter backend build`; Windows lock Prisma engine
  отделять от кода и повторять build после освобождения runtime.
- Prisma: `pnpm --filter backend exec prisma validate`, migration status и
  disposable DB migrate test.
- Admin: `pnpm --filter admin lint`, `pnpm --filter admin build` и browser
  smoke user detail/table at desktop and narrow width.
- Bot: `pnpm --filter bot build`; real Telegram `/start ma_...` smoke через
  HTTPS runtime, без Web App localhost button.
- Consumer audit: `rg` по `backend`, `admin`, `client`, `bot`, `shared` на
  `User.utm*`, DTO fields и прежний `attributionSummary` contract.

## Риски и запреты

- Нельзя копировать campaign UTM в `User` как workaround: это разрушит
  first/last и immutable snapshot semantics.
- Нельзя удалить колонки без доказанного zero-data preflight.
- Нельзя менять `MarketingCampaign.utm*`, touch/snapshot/report/XLSX поля под
  видом cleanup legacy user UTM.
- Нельзя превратить users list в marketing read model или делать отдельный
  marketing request на каждую строку таблицы.
- Не объявлять Phase 21 fully verified, пока web/bot real transport smoke и
  post-migration evidence не завершены.

## Definition of Done

- В схеме, DTO, bot/user write paths и admin contracts нет `User.utm*`.
- Migration применена только после zero-data preflight и проходит на чистой БД.
- Campaign UTM отображаются в понятной factual timeline и сохраняются в
  reports/CPA/XLSX.
- Users UI не называет identity/login channel источником трафика.
- Backend/admin/bot gates и manual web/bot campaign smoke подтверждены.
- Durable Phase 20/21/runtime docs синхронизированы с фактическим контрактом.
