# Marketing Attribution Runtime

> [Корневой документ wiki](../README.md)

> Целевой runtime-контракт для [Phase 21](../phases/phase-21-marketing-attribution-and-campaign-links.md).
> До реализации source of truth для текущего поведения остаются Prisma schema и
> существующие `referrals`, `promo-codes`, `orders`, `auth`, `users`, `client`
> и `bot` owners. Этот документ не утверждает, что target-сущности уже есть в
> production.

## Зачем нужен отдельный контур

Текущие `User.utmSource`, `utmMedium`, `utmCampaign` — legacy-поля для
одноразового display bucket. Они не содержат `content`/`term`, истории
касания, trusted web capture, first/last attribution или order snapshot.
`ReferralLink` и `PromoCode` уже решают другую задачу: acquisition/reward и
checkout discount соответственно.

Новый backend module `marketing-attribution` владеет campaign links,
маркетинговыми касаниями, immutable registration/order snapshots, admin
reporting и export. Он не становится владельцем скидок, выплат или рассылок.

## Namespaces и ownership

- `MarketingCampaign`, а не общий `Campaign`: Phase 19 резервирует
  `TelegramBroadcastCampaign` для outbound-рассылок, audience snapshot и
  delivery state.
- `marketing-attribution` владеет `MarketingCampaign`, `MarketingTouch`,
  `UserMarketingAttribution`, `OrderMarketingAttribution`, campaign audit и
  их API/read models.
- `referrals` остаётся единственным owner `ReferralLink`, регистрации
  реферала и его mutable-until-first-primary-order policy.
- `promo-codes` остаётся owner скидки, reservation и reward-policy snapshot.
- `PartnerRewardsService` остаётся единственной точкой записи
  `REFERRAL_BONUS`; marketing attribution не рассчитывает и не начисляет CPA.
- `orders` создаёт immutable attribution snapshot в своей transaction, но не
  строит campaign/business rules локально.
- `auth` проверяет Telegram `initData`; `bot`, `client` и `admin` только
  передают launch intent через backend API.
- Dependency direction: `auth`, `users` и `orders` вызывают exported marketing
  owner; `marketing-attribution` может потреблять `ReferralsService`, но не
  импортирует `OrdersModule`, `AuthModule` или `UsersModule` обратно.
- Existing `analytics` dashboard не расширяется campaign-логикой; отчёты
  принадлежат marketing module, хотя admin screen использует существующий
  маршрут `/analytics`.

## Target data contract

### `MarketingCampaign`

Campaign хранит человеческое имя, URL-safe short code, canonical UTM tuple
(`source`, `medium`, `campaign`, optional `content`/`term`), relative target
path, activation state и optional `referralLinkId`.

`referralLinkId` только связывает кампанию с уже существующей партнёрской
ссылкой. Discount, partner owner, bonus percent и payout mode читаются у
`ReferralLink`/`PromoCode`, не копируются в campaign.

После первого accepted touch short code, UTM tuple, target path и linked
referral link immutable; для новой разметки создаётся новая campaign. Кампания
деактивируется, но не удаляется и не деактивирует linked referral link/promo.

### `MarketingTouch`

Touch — append-only факт входа по active campaign:

- channel: `WEB`, `TELEGRAM_BOT` или `TELEGRAM_MINI_APP`;
- campaign, occurrence time и source-event idempotency key;
- optional canonical user after trusted claim;
- pseudonymous visitor-key HMAC только пока нужен для web claim.

В touch не хранятся raw Telegram `initData`, bot token, IP, full referrer или
произвольный landing URL. У UTM нет самостоятельного client input: backend
берёт tuple из выбранной campaign.

### User и registration attribution

`UserMarketingAttribution` — one-to-one read state рядом с `User`, а не новые
колонки в `User`. Он хранит current first/last touch и отдельные immutable
first/last snapshots на момент регистрации. Последние нужны, чтобы новый touch
у уже зарегистрированного клиента не переписал историческую метрику
«Регистрации».

Каждый новый account creation path открывает registration-attribution state.
Trusted web claim или Telegram launch завершает его с campaign snapshot либо с
явным direct/no-campaign outcome. Existing users и legacy UTM не получают
синтетический historical backfill.

### Order attribution

`OrderMarketingAttribution` — one-to-one immutable snapshot first/last touch
при создании primary order. Он создаётся внутри той же local transaction, что
и order, через marketing owner. Dashboard читает именно snapshot, а не текущий
`UserMarketingAttribution`.

Top-up (`parentOrderId != null`) не является first/repeat primary purchase и
не входит в commissionable CPA/revenue. Если LTV top-up потребуется позднее,
это отдельная secondary metric, не подмена основного отчёта.

## Capture flows

### Web

Каноническая web-ссылка строится backend-ом из `SITE_URL` как
`/r/<shortCode>` и может дополнительно нести display UTM query. Campaign code
остаётся единственным authoritative input: произвольные raw UTM без code не
создают managed campaign/touch.

Client route создаёт opaque visitor token и per-launch idempotency key в
first-party storage, а backend хранит только HMAC token. После JWT bootstrap
authenticated claim связывает pending touches с canonical `User`; claim
безопасно повторяем.

Это не зависит от несуществующего отдельного landing runtime на
`mojomobile.ru` и не требует cross-subdomain cookie. Внешний лендинг при
появлении должен передавать только short code на canonical app URL.

### Telegram

Есть два независимых Telegram entrypoint:

- `https://t.me/<bot>?start=ma_<code>`: bot получает `/start`, передаёт
  trusted service-token event в backend;
- `https://t.me/<bot>?startapp=ma_<code>`: Mini App получает `start_param`,
  а backend берёт его только из HMAC-validated Telegram `initData`.

`ref_` остаётся namespace referral flow. Mini App `startapp` не считается
fallback-дублем bot `/start`; оба flow имеют свои event keys и не должны
двойно увеличивать clicks.

Telegram ограничивает start parameter 64 URL-safe символами. Short-code
контракт и parser обязаны сохранять этот лимит, а WebApp verification должна
проверять не только HMAC, но и freshness `auth_date` до attribution write.

## Referral, promo и CPA boundary

Campaign, связанная с `ReferralLink`, может запросить у `ReferralsService`
регистрацию этого link только после trusted user association. Сервис сохраняет
свои current rules: legacy referral immutable, partner link может смениться до
первого completed primary order, self-referral запрещён.

Campaign не пишет `User.referralLinkId` напрямую, не применяет promo и не
добавляет reward. Existing checkout определяет auto-promo из current
`ReferralLink`; completion accounting сохраняет precedence:
manual partner promo → referral link → legacy referral.

CPA report читает successful `REFERRAL_BONUS` ledger и snapshot payout mode,
а не умножает revenue на campaign percent. Поэтому изменения campaign label или
deactivation не переписывают финансовую историю.

## Reporting и admin surface

`/analytics` становится экраном «Источники трафика» с тремя typed tabs:

1. Campaign constructor/list: generated web, bot and Mini App links, QR code,
   activation и read-only linked partner offer.
2. Attribution report: date/channel filters и explicit first-touch/last-touch
   model. Clicks — deduplicated touches; registrations — registration snapshot;
   purchases/revenue — completed primary orders through order snapshot.
3. Bloggers/CPA: только campaigns with linked `ReferralLink`, actual reward
   ledger, payout-mode split и XLSX export.

Promo codes и partner links остаются отдельными owner screens. Constructor
может выбрать существующую referral link, но не создаёт PromoCode/ReferralLink
через несколько неатомарных frontend calls.

User detail получает touch timeline отдельным admin-only marketing read route;
mixed `GET /users/:id` не расширяется. Existing Phase 20 compact
`attributionSummary` сохраняет legacy facts до отдельной consumer migration.

`SUPPORT` получает read-only report/timeline; `MANAGER` и `SUPER_ADMIN` могут
создавать, изменять и деактивировать campaigns. Backend проверяет роль, UI
только отражает разрешения. Campaign audit фиксирует operator mutations.

Это не молча меняет нынешнюю broad `JwtAdminGuard` policy у существующих
PromoCodes/ReferralLinks. Если product потребует одинаковый role hardening для
этих owner screens, он проходит отдельный consumer audit и contract change.

## Security, lifecycle и rollout

- Все новые bodies/query — DTO classes; admin/user/bot/public routes используют
  соответствующие guards и отдельные rate limits.
- Public capture принимает только campaign code + opaque bounded identifiers;
  code не раскрывает linked partner policy.
- Anonymous visitor HMAC очищается после claim либо после bounded TTL;
  anonymized event остаётся только для aggregate click statistics.
- User deletion не уничтожает historical campaign/order facts каскадом:
  removable пустой account отвязывается/anonymizes, а order-backed history
  продолжает жить.
- Migration не materializes fake touches/snapshots из `User.utm*` или старых
  orders. Отчёт явно показывает rollout boundary.
- Schema/relations проходят migration preflight, `prisma migrate`, targeted
  tests и consumer audit. New module появляется в `module-map.md` только
  вместе с живым implementation.

## Links

- [Phase 21](../phases/phase-21-marketing-attribution-and-campaign-links.md)
- [Referral Runtime](./referrals-runtime.md)
- [Promo Codes Runtime](./promo-codes-runtime.md)
- [Auth Identity Runtime](./auth-identity-runtime.md)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Telegram deep links](https://core.telegram.org/api/links)
