# Step 02 — Schema, lifecycle и marketing module foundation

> [Назад к Phase 21](../phase-21-marketing-attribution-and-campaign-links.md)

## Цель

Добавить durable marketing data model и isolated Nest module без backfill-выдумки
или дублирования финансовых owners.

## Что нужно сделать

- Добавить `MarketingCampaign`, append-only `MarketingTouch`, user registration/
  current attribution state, immutable order snapshot и campaign audit.
- Зафиксировать FK/index/delete semantics: campaign history не каскадно не
  исчезает, removable empty user anonymizes/unlinks marketing facts, order
  history остаётся доказуемой.
- Сделать migration и preflight; не materialize records из `User.utm*`, старых
  orders или current referral fields.
- Создать `marketing-attribution` module с campaign/lifecycle/capture owners,
  DTOs и backend admin role policy; reporting owner добавляется в Step 07.
- Генерировать canonical web/bot/Mini App links только из backend config;
  campaign code/UTM tuple/link reference freeze после первого touch.

## Результат шага

- Schema поддерживает historic-first/last и registration/order snapshot без
  новых overloaded User fields.
- New campaign can safely reference existing `ReferralLink`, but no campaign
  field duplicates promo/reward policy.
- Migration проходит на реальной базе без synthetic legacy history.
- Admin campaign API закрыт `JwtAdminGuard` и role policy; capture/lifecycle
  остаются internal exported owners без Nest cycle. Public/user/service-token
  routes добавляются только вместе с trusted flows в Steps 03–04.

## Не входит в scope

- Browser/Telegram capture endpoints и client/bot integration.
- Existing referral registration or checkout reward policy changes.

## Зависимости

- Step 01.

## Статус

`completed`

## Evidence

- Additive Prisma migration
  `20260710051414_add_marketing_attribution_foundation` создаёт campaigns,
  append-only touches, user/order snapshots и campaign audit без materialize из
  legacy `User.utm*`, текущих referral-полей или старых orders.
- `MarketingAttributionModule` изолирован от `auth`, `users` и `orders` и
  экспортирует campaign, capture и lifecycle owners; финансовые referral/promo
  owners не импортируются и не меняются.
- Campaign API генерирует short code и web/bot/Mini App links исключительно из
  backend config. `MANAGER`/`SUPER_ADMIN` могут мутировать кампанию, `SUPPORT`
  получает только read access; после первого touch code/UTM/target/referral link
  frozen, while activation remains auditable lifecycle action.
- Link config валидируется до create/update campaign transaction, а responses
  собираются до commit; invalid config не оставляет campaign/audit после failed
  response.
- `UserMarketingAttribution` ведёт current first/last через compare-and-set;
  registration snapshot создаётся idempotently. Order snapshot model и lifecycle
  seam добавлены без production hook; at-least-once conflict-safe persistence и
  runtime proof принадлежат Step 05. User deletion очищает user relation и
  visitor HMAC у marketing facts вместо cascade delete.
- Первичное one-to-one state сериализуется `FOR NO KEY UPDATE` lock на canonical user row:
  после lock transaction повторно читает state и либо создаёт его, либо берёт результат
  конкурентного capture. Он совместим с FK `KEY SHARE` touch, но исключает parallel initialization
  и user deletion; `P2002` в aborted transaction не обрабатывается.
- Campaign capture и operator mutation берут один campaign row lock;
  active/freeze checks выполняются после lock, поэтому concurrent touch
  не может обойти deactivation или freeze immutable campaign fields.
- Source-event retry разрешается до active-campaign lookup и возвращает только
  identity-equivalent touch; payload mismatch даёт conflict, а parallel insert
  завершается через `skipDuplicates` + strict readback без aborted transaction.
- Migration `20260710130009_enforce_marketing_touch_single_association`,
  typed/runtime XOR и DB CHECK запрещают touch одновременно хранить `userId` и
  visitor HMAC; capture создаёт ровно одну association, а deletion-safe оба
  `null` разрешены только для anonymized historical fact. Атомарный
  pending visitor → canonical user claim и очистка HMAC принадлежат Step 03;
  Step 02 не содержит недостижимую association-мутацию в retry path.
- Follow-up audit исправил пустой/whitespace `referralLinkId`: DTO и service
  возвращают `400` до lookup/transaction, а отвязка остаётся только явным
  `null`; PATCH больше не может молча disconnect существующую referral link.
- Follow-up audit также отклоняет `isActive: null` в DTO и service до campaign
  row lock: optional boolean можно только опустить, но нельзя передать как
  `null`, поэтому PATCH не достигает Prisma с невалидным NOT NULL значением.
- Follow-up audit снимает hot-campaign serialization: capture использует
  совместимый `FOR SHARE`, а operator `FOR UPDATE` сохраняет границу
  deactivation/freeze; Prisma transaction явно получает `maxWait: 10s` и
  `timeout: 60s` вместо дефолтного бюджета.
- Follow-up audit сериализует finalization registration snapshot с current-touch
  CAS: lifecycle берёт `FOR UPDATE` на `UserMarketingAttribution`, перечитывает
  first/last под этим lock и исключает immutable snapshot устаревшего state.
- Follow-up audit закрывает claimed-touch replay leak: anonymous retry после
  trusted claim получает conflict и не возвращает canonical `userId`, потому
  что очищенный visitor HMAC уже не может доказать ту же association.
- Follow-up audit преобразует stale или удалённый `userId` при первичной
  инициализации state в доменный `404`: пустой canonical user lock не доходит
  до Prisma FK `P2003` и не возвращает raw `500`.
- Follow-up audit преобразует исчерпанную коллизию generated `shortCode` в
  доменный `409`: после всех retry попыток raw unique violation `P2002` не
  выходит через admin API.
- Follow-up audit выравнивает update с create: link config валидируется до
  row lock, mutation и audit, поэтому invalid config fail-fast не удерживает
  campaign transaction и не создаёт rollback-only работу.
- Follow-up audit заменяет raw Prisma campaign response явной allowlist-моделью:
  read API не раскрывает `referralLink.userId` или `_count`; внутренний touch
  count остаётся только данными freeze guard.
- Local migration deploy и `prisma migrate status` прошли; backend build и 56
  Jest suites / 508 tests зелёные. Targeted specs покрывают lifecycle/capture,
  admin guard/role policy, DTO contract, campaign immutability, snapshots,
  anonymization и module graph.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/modules/marketing-attribution/**`
- `backend/src/app.module.ts`
- `backend/src/modules/users/user-admin-deletion.service.ts`
- `.env.example`

## Тестирование / Верификация

- Prisma validation, migration preflight и migration apply path.
- Specs: short-code collision retry/immutability, activation, referral-link
  reference, capture idempotency/concurrency, first/last compare-and-set,
  snapshot idempotency и deletion/anonymization.
- Module graph spec доказывает отсутствие imports/cycle и exported owners;
  DTO/controller specs доказывают `JwtAdminGuard`, `SUPPORT` read-only и
  `MANAGER`/`SUPER_ADMIN` mutation policy.
- Public/user/service-token route guards не заявлены evidence Step 02: их
  endpoints и manual flows принадлежат Steps 03–04.
- Lookup: `INV-DTO-1`, `INV-TYPE-1`, `INV-AUTH-1`, `INV-PRISMA-1`, `INV-TX-1`,
  `INV-REUSE-1`, `INV-SRP-1`, `INV-SIZE-1`.
