# Marketing Attribution Runtime

> [Корневой документ wiki](../README.md)

> Durable runtime-контракт контура marketing attribution. [Phase 21](../phases/phase-21-marketing-attribution-and-campaign-links.md) владеет scope, порядком работ, статусом и evidence; этот документ не ведёт журнал реализации.

## Граница контура

`marketing-attribution` владеет campaign links, trusted touches, current
attribution state пользователя, immutable snapshots регистрации и заказа,
campaign audit, attribution read models и export.

Контур не владеет скидкой, регистрацией реферала, reward ledger, checkout,
платёжным статусом или outbound-рассылкой:

- `referrals` — единственный owner `ReferralLink`, его registration policy и
  mutable-until-first-completed-primary-order правила;
- `promo-codes` — единственный owner скидки, reservation и reward-policy
  snapshots;
- `PartnerRewardsService` — единственная точка записи `REFERRAL_BONUS`;
- `orders` создаёт snapshot в своей транзакции, но не содержит локальных
  campaign rules;
- `auth` проверяет identity и Telegram WebApp `initData`;
- `admin`, `client` и `bot` — клиенты backend API, а не владельцы attribution
  business logic;
- Phase 19 резервирует `TelegramBroadcastCampaign` для outbound-рассылок.
  В marketing attribution допустимо только имя `MarketingCampaign`;
- поведенческая веб-аналитика (pageviews, сессии, воронки) принадлежит
  внешнему счётчику (Яндекс.Метрика); контур хранит только attribution-факты
  для Telegram-каналов, регистраций, заказов и CPA.

Dependency direction односторонний: `auth`, `users` и `orders` вызывают
exported marketing owner. Marketing module не импортирует их модули обратно и
не создаёт Nest cycle. Связь с `ReferralsService` допустима только для
делегирования canonical referral registration после trusted user association.

## Данные и их lifecycle

### Marketing campaign

`MarketingCampaign` хранит:

- backend-generated URL-safe `shortCode`;
- `name`, canonical UTM tuple (`source`, `medium`, `campaign`, optional
  `content`/`term`) и относительный `targetPath`;
- `isActive`/`deactivatedAt`;
- optional `referralLinkId` как ссылку на существующий `ReferralLink`.

Campaign не копирует promo, partner owner, bonus percent или payout mode.
После первого accepted touch immutable: short code, UTM tuple, target path и
linked referral link. Для новой разметки создаётся новая campaign. Кампания
только деактивируется, не удаляется и не меняет linked referral/promo.
Capture берёт `FOR SHARE` на campaign row: concurrent captures одной active
campaign выполняются параллельно, а operator mutation с `FOR UPDATE` ждёт их
commit. Поэтому active/freeze checks всё ещё выполняются после row lock в той
же transaction, что и touch write, но viral traffic не сериализуется на одном
exclusive capture lock.

Каждая operator mutation создаёт `MarketingCampaignAudit` с actor, ролью,
event и before/after snapshot. Audit не зависит от существования actor record.

### Marketing touch

`MarketingTouch` — append-only факт входа по active campaign. Он хранит
campaign, `channel`, `occurredAt`, unique source-event idempotency key и только
необходимую association:

- canonical `userId` — после trusted association;
- HMAC visitor key — только на время anonymous web claim.

Новый touch принимает ровно одну association. DB constraint запрещает хранить
`userId` и visitor HMAC одновременно; trusted association записывает canonical
user и очищает HMAC одной мутацией. Оба поля могут быть `null` только у
anonymized historical fact после разрешённого удаления пользователя.

Retry сначала разрешается по source-event key независимо от текущей активности
campaign. Совпавший key обязан описывать ту же campaign, channel, occurrence и
association; mismatch завершается conflict и не создаёт/не перепривязывает
touch. Concurrent insert использует conflict-safe insert/readback, не обработку
unique violation внутри уже abort-нутой transaction.

После trusted claim anonymous retry не может совпасть с association: visitor
HMAC уже очищен, а canonical `userId` anonymous caller не предоставляет. Такой
replay получает conflict без возврата claimed `userId`; idempotent retry после
claim возможен только из trusted user flow с тем же canonical user.

Допустимые каналы: `WEB`, `TELEGRAM_BOT`, `TELEGRAM_MINI_APP`. В touch нельзя
хранить raw Telegram `initData`, bot token, IP, полный referrer, произвольный
landing URL или client-supplied UTM tuple. UTM всегда читается из campaign.

### User и registration attribution

`UserMarketingAttribution` — отдельное one-to-one state рядом с `User`, а не
набор новых полей в `User`. Оно хранит current first/last touch; first/last
обновляются compare-and-set по времени touch, а не перезаписываются последним
пришедшим запросом.

Если state ещё нет, его создание сериализуется `FOR NO KEY UPDATE` lock на canonical
строке существующего `User`: владелец lock повторно читает state и единолично создаёт
его, а ожидавшая transaction только переиспользует этот state. Lock совместим с FK `KEY SHARE`, который
уже взят при записи touch, но блокирует такой же initialization и user deletion. Ветка не
восстанавливается из `P2002` в уже прерванной transaction. Если canonical user не найден
под lock, lifecycle возвращает доменный `404` и не пытается создать state с невалидным FK.

Registration фиксируется один раз в статусе `DIRECT` или `ATTRIBUTED`:
first/last touch и campaign/UTM/channel snapshot сохраняются в state отдельно
от current first/last. Eligibility для такой финализации создаётся только в
той же transaction, что и новый email/OAuth account; authenticated claim без
pending touch честно фиксирует `DIRECT`. Existing account без этого durable
marker получает только current attribution от позднего campaign click и не
приобретает synthetic registration metric. Telegram account получает свой
trusted registration flow только в bot/Mini App boundary. Legacy `User.utm*`
и старые user/referral fields не являются touch history и не используются для
synthetic backfill.

Campaign UTM принадлежат только `MarketingCampaign` и immutable snapshots.
Target-схема не хранит `utmSource`, `utmMedium` или `utmCampaign` на `User`, а
bot-facing `users/find-or-create` не принимает произвольный UTM tuple. Удаление
старых колонок допускается только после отдельного data preflight; найденные
значения нельзя автоматически превращать в touches или registration snapshots.

Перед финализацией registration snapshot берёт `FOR UPDATE` на строке
`UserMarketingAttribution`, затем перечитывает current first/last. Поэтому
concurrent current-touch CAS либо commit до snapshot, либо ждёт после него;
immutable registration result не может застыть на устаревшем состоянии.

### Order attribution

`OrderMarketingAttribution` — one-to-one immutable first/last snapshot при
создании primary order. Snapshot создаётся idempotently по `orderId` внутри
той же local transaction, что и primary order.

Top-up (`parentOrderId != null`) не получает primary-order snapshot и не
участвует в first/repeat purchase, commissionable revenue или CPA. Отчёты
читают order snapshot, а не current `UserMarketingAttribution`.

## Canonical campaign links

Backend строит links только из configuration и campaign data:

- web: `SITE_URL/r/<shortCode>` с display UTM query;
- bot: `https://telegram.me/<TELEGRAM_BOT_USERNAME>?start=ma_<shortCode>`;
- Mini App: `https://telegram.me/<TELEGRAM_BOT_USERNAME>?startapp=ma_<shortCode>`.

Required link configuration валидирована до create/update campaign transaction;
responses собираются в той же transaction, что campaign и audit. Config/link
error не может оставить committed campaign или audit после failed API response.

`shortCode` — единственный authoritative campaign input. Display UTM не
создаёт managed campaign и не меняет её internal attribution. `targetPath`
всегда относительный path приложения: внешний redirect и `//` path запрещены.

`ma_` — namespace marketing attribution. `ref_` остаётся referral namespace.
Telegram start parameter вместе с prefix не превышает 64 URL-safe символа.

## Trusted capture boundary

Public capture принимает только active campaign code и bounded opaque
idempotency/visitor identifiers. Из raw browser input он не получает campaign
metadata, referral policy или UTM.

Web flow хранит opaque visitor token в first-party storage и передаёт его
только на bounded capture/claim transport boundary; backend вычисляет HMAC и
persist-ит только HMAC вместе с opaque idempotency key. Visitor token остаётся
в браузере до logout, а launch key изолирован в tab session: successful claim
не может лишить уже начатый capture в другой вкладке его association key. Client
делает claim только после fresh web login или нового capture, а не на каждом
bootstrap восстановленной сессии. После JWT claim одной атомарной мутацией
привязывает все pending touches к canonical user и очищает HMAC; current
first/last CAS получает не более двух детерминированных representatives —
earliest и latest по `(occurredAt, id)`. Поэтому большой batch не создаёт N+1
lifecycle writes, но сохраняет корректный current state и immutable registration
snapshot. Claim идемпотентен и не может отвязать или присоединить touch к другому
user. Telegram Login Widget не создаёт отдельный touch: после его
server-verified login клиент запускает этот же web claim. Поэтому ранее
зафиксированный WEB touch создаёт `ATTRIBUTED` snapshot, а отсутствие pending
touch — `DIRECT` snapshot.

Bot flow принимает `ma_` раньше решения find-or-create и создаёт trusted event
только через service-token boundary с проверкой canonical
`UserIdentity(TELEGRAM, providerSubject)` → user relation. Не-null legacy
`User.telegramId` дополнительно обязан совпасть с verified identity, но `null`
не отменяет valid explicit Telegram link. Mini App извлекает `start_param`
исключительно из server-validated `initData`: HMAC и freshness `auth_date`
проверяются до write. Значения из `initDataUnsafe`, URL query или client state
не являются source of truth.

Marketing и referral используют одну проверку в `ReferralsService`; она не
допускает копию legacy-сравнения `User.telegramId` и применяет contact field
только как дополнительный drift-check к canonical `UserIdentity`.

После успешного Mini App login auth передаёт marketing owner только verified
launch intent: canonical `userId`, Telegram provider subject, bounded
`start_param` и opaque source-event key. Marketing owner durable upsert-ит
intent по source-event key; raw `initData`, Telegram hash и JWT в нём не
хранятся. Для нового Mini App account intent создаётся в той же transaction,
что `UserIdentity` и registration eligibility. Existing account создаёт intent
только для `ma_` launch; обычный повторный Mini App login без campaign не
создаёт marketing write. Auth не ждёт capture transaction: cron — единственный
consumer pending/failed intent, захватывает его lease через compare-and-set и
обрабатывает с bounded backoff. Успешная transaction создаёт touch и
финализирует registration snapshot, после чего intent удаляется; terminal
identity/input/idempotency conflict помечается `REJECTED` без бесконечного
retry и хранится семь дней только для диагностики. Операционный intent не
является историческим фактом и также удаляется вместе с removable user.

`start` и `startapp` — независимые event domains и имеют разные idempotency
keys; один flow не является fallback-дублем другого.

## Referral, promo и CPA boundary

Campaign с `referralLinkId` может только попросить `ReferralsService`
зарегистрировать существующий link после trusted association. Она не пишет
`User.referralLinkId` напрямую, не создаёт PromoCode и не начисляет reward.

Checkout сохраняет действующий порядок: manual partner promo → referral link →
legacy referral. CPA использует successful `REFERRAL_BONUS` ledger и reward
snapshots, а не calculation from campaign fields. Смена label, деактивация или
изменение текущего referral state не переписывают financial history.

## API, access и read models

Campaign read доступен admin roles. Создание, изменение и деактивация campaign
разрешены только `MANAGER` и `SUPER_ADMIN`; `SUPPORT` получает read-only
campaign/report/timeline access. Ограничение проверяется backend owner, а не
только UI.

Campaign API отдаёт curated read model, а не Prisma row: linked referral
ограничен `id`, `code`, `label` и `isActive`. Его owner id и relation counts
остаются внутренними данными; они не становятся неявным публичным контрактом.

Bodies и queries API — DTO classes. Public, user, admin и service-token routes
имеют отдельные guards и rate limits. Public response не раскрывает linked
partner policy.

Admin reporting живёт в marketing module, даже если UI использует `/analytics`.
Он использует только domain facts:

- clicks — deduplicated touches;
- registrations — registration snapshots;
- purchases/revenue — completed primary orders через order snapshots;
- CPA — actual successful reward ledger.

Все отчёты явно выбирают first-touch или last-touch dimension. User touch
timeline — отдельный admin marketing read route; mixed `GET /users/:id` не
расширяется marketing details.

### Compact acquisition summary для admin users

`GET /users` и `GET /users/admin/:id` могут включать только компактную
registration-attribution проекцию, но не touch history. Значения для набора
canonical `User.id` рассчитывает exported owner из `marketing-attribution`
одним bounded batch read после формирования страницы пользователей. `users`
не читает raw `UserMarketingAttribution` поля и не копирует правила статусов;
отдельный marketing request на каждую строку запрещён.

Компактный marketing summary различает пять factual состояний:

- `ATTRIBUTED` — registration snapshot содержит campaign touch;
- `DIRECT` — eligible registration финализирована без campaign touch; в UI это
  подписывается «Без кампании», а не «Прямой вход»;
- `PENDING` — есть non-null `registrationEligibleAt`, финализация действительно
  ожидается;
- `REGISTRATION_NOT_TRACKED` — state существует, но eligibility отсутствует;
  current/late touch не объявляется источником регистрации;
- `NO_STATE` — marketing state отсутствует, поэтому достоверных данных о
  регистрации нет.

Для `ATTRIBUTED` проекция возвращает immutable registration first/last с
representative touch id, campaign name/code, channel и UTM tuple. Одинаковый
representative показывается один раз с несколькими semantic roles; разные
first/last не схлопываются по совпавшим labels или UTM.

Admin users UI называет составную колонку «Привлечение». В ней marketing
registration summary и factual referral summary отображаются независимыми
badges и могут существовать одновременно. Referral не заменяет campaign,
campaign не выводится из referral, а login identity остаётся только в колонке
«Вход». Пустой визуальный прочерк не используется как доменный verdict:
оператор видит явное состояние marketing summary и, при наличии, referral.

### Reporting contract

Compile-time vocabulary отчётов принадлежит
`shared/marketing-attribution-report.ts`: backend DTO/services и admin UI
переиспользуют оттуда список и подписи моделей, UTC date helpers, default/cap
диапазона, подписи каналов и fallback отображения партнёра. Локальные копии
этих правил по рантаймам не являются отдельным контрактом.

Admin-only report API принадлежит `marketing-attribution` и состоит из
`GET /marketing-attribution/reports/attribution`,
`GET /marketing-attribution/reports/attribution/orders`,
`GET /marketing-attribution/reports/cpa` и
`GET /marketing-attribution/reports/export`. Summary и export route используют один
typed filter contract: обязательная пара `dateFrom`/`dateTo` в формате
`YYYY-MM-DD` либо rolling default за последние 30 UTC-календарных дней,
optional `channel` и `model=FIRST_TOUCH|LAST_TOUCH` с default `LAST_TOUCH`.
Диапазон inclusive по датам, исполняется как UTC half-open interval
`[dateFrom 00:00, dateTo + 1 day 00:00)` и ограничен 366 днями.

Дата имеет event-window, а не единую synthetic cohort semantics:

- clicks фильтруются по `MarketingTouch.occurredAt` и всегда остаются фактом
  самой campaign; переключение модели не переписывает clicks;
- registrations фильтруются по immutable `registrationFinalizedAt`, а campaign
  и channel выбираются только из first/last registration snapshot;
- purchases и revenue фильтруются по `Order.completedAt`, относятся только к
  `COMPLETED` primary order с существующим `OrderMarketingAttribution` и
  выбирают campaign/channel только из first/last order snapshot;
- first purchase — первый completed primary order пользователя во всей
  истории по `(completedAt, id)`, а repeat purchase — каждый следующий, даже
  если первый order лежит вне выбранного окна;
- direct registrations/orders образуют отдельную factual строку без campaign;
  channel filter исключает её, потому что у direct snapshot нет channel.

`GET /marketing-attribution/reports/attribution/orders` — paginated operator
drill-down именно для purchase/revenue строки. Он принимает те же date/channel/
model filters и требует `source=CAMPAIGN` вместе с `campaignId` либо
`source=DIRECT` без campaign id. Route возвращает только exact completed primary
orders (max 100 на страницу), из которых сложена выбранная строка, и для каждого
отдаёт lifetime purchase sequence (`FIRST` или `REPEAT`). `meta.total` отражает
весь matching set и не обнуляется для пустой страницы за его пределами. General `/orders`
не получает campaign-фильтры и не становится владельцем attribution rules.

API возвращает эти date-field semantics рядом с filters. UI подписывает их и
не вычисляет click-to-registration, registration-to-order или другие ratios
между разными event-time universes.

Bloggers/CPA read model содержит только campaigns с immutable linked
`ReferralLink`. Acquisition/revenue берутся из выбранного order snapshot, а
reward count, payout total и payout-mode split — только из successful
`REFERRAL_BONUS` ledger rows, у которых одновременно совпадают `orderId` и
linked `referralLinkId`. Manual partner promo reward, legacy referral reward и
current referral policy не становятся fallback. Actual CPA допускается только
как `ledger payout / rewarded primary orders`; отсутствующий ledger означает
нулевой payout, а не восстановление денег из процента.

Campaign name, lifecycle state и partner display fields в report являются
labels. Они не участвуют в расчёте registration, revenue или CPA, поэтому
переименование/deactivation campaign и изменение текущей partner policy не
пересчитывают историю.

XLSX export использует те же filters и те же read models, создаёт два листа с
стабильными русскими заголовками (`Атрибуция`, `Блогеры и CPA`) и не выполняет
отдельный product-specific query. В CPA-листе человекочитаемый `Referral link`
равен `label || code`, а canonical `Referral code` экспортируется отдельной
колонкой. Общий лимит — 10 000 data rows; превышение заканчивается явным `413`,
а не silent truncation. Download доступен всем admin roles под тем же
`JwtAdminGuard`; campaign mutations остаются ограничены своей отдельной role
policy.

## Rollout boundary и начало достоверной истории

Marketing attribution вводится additive Prisma migrations. Перед production
rollout обязателен backup и `prisma migrate status`; backend startup выполняет
`prisma migrate deploy`, после чего readiness backend проверяется до публикации
новых campaign links и включения bot/Mini App traffic. `NEXT_PUBLIC_API_URL`
для admin/client задаётся как origin backend без suffix `/api`; клиенты сами
добавляют API prefix.

Достоверная marketing history начинается только после применения migrations и
включения соответствующего capture traffic. Legacy `User.utm*`, старые orders,
текущий referral state и существующие ссылки не backfill-ятся в touches или
snapshots. Поэтому отсутствие данных до rollout timestamp означает отсутствие
подтверждённого attribution-факта, а не нулевую эффективность кампании.

Минимальный post-deploy smoke: создать campaign из admin, открыть generated web
link, выполнить bot `start` и Mini App `startapp`, завершить primary order,
проверить top-up exclusion, first/last report, CPA/XLSX и SUPPORT mutation
denial. До успешного smoke campaign links не распространяются массово.

## Retention и referential integrity

Campaign, touch, snapshots и campaign audit — исторические факты. Campaign
history не исчезает cascade delete. Удаление removable empty user отвязывает
`userId` от touch/state и очищает visitor HMAC; order-backed history остаётся
доказуемой. Состояние с order/referral/promo/reward business data удалению
пользователя не подлежит по правилам соответствующих owners.

Schema changes проходят только Prisma migrations. Миграции marketing
attribution никогда не materialize fake touches или snapshots из legacy UTM,
старых orders либо current referral fields.

## Связанные контракты

- [Referral Runtime](./referrals-runtime.md)
- [Promo Codes Runtime](./promo-codes-runtime.md)
- [Auth Identity Runtime](./auth-identity-runtime.md)
