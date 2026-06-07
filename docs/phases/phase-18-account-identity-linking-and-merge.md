# Phase 18: Account Identity Linking & Merge

> [Корневой документ wiki](../README.md)

## Цель

Вынести способы входа пользователя из legacy slot `User.authProvider/providerId`
в durable identity model, чтобы один canonical бизнес-аккаунт мог безопасно
иметь Telegram, email, Google, Yandex и VK identities без silent merge,
потери заказов, платежных токенов, referral/promo ownership и уведомлений.

Фаза не является маленькой UI-доработкой. Это архитектурное изменение account
boundary.

## Результат

- `User` остается canonical business account для денег, заказов, eSIM,
  referral ownership, partner rewards, saved cards и notification targets.
- Появляется `UserIdentity` как отдельная таблица способов входа.
- Появляется audit trail для identity events: backfill, explicit link, unlink,
  conflict/preflight и support merge decisions.
- Существующие пользователи получают backfilled identities без удаления legacy
  полей в том же шаге.
- Email, OAuth, Telegram Widget, Telegram WebApp и bot registration используют
  общий identity resolver.
- JWT продолжает выдаваться на canonical `user.id`.
- OAuth больше не делает silent link/merge по одному совпавшему email.
- Появляется read-only user-facing surface для просмотра привязанных способов
  входа.
- Link/unlink provider-ов становится явным действием авторизованного
  пользователя с conflict handling.
- Admin/support получает preflight/audit контур для дублей и merge decisions.
  Автоматический merge в login flow запрещен.
- OAuth link flow использует signed short-lived state/nonce с явным
  `action=link`; публичный OAuth callback не привязывает provider только по
  `state=returnTo` или совпавшему email.
- Runtime wiki фиксирует новый contract и affected downstream surfaces.

## Оценка

- Размер фазы: `large`
- Ожидаемое число шагов: `7`
- Основные риски:
  - silent merge двух разных пользователей по email;
  - потеря доступа к аккаунту после переключения login resolver;
  - перенос заказов, баланса или payment tokens внутри auth flow;
  - конфликт Telegram как login identity и notification chat id;
  - нарушение referral/promo owner contracts из Phase 16/17;
  - выдача JWT на неправильный canonical `User.id`;
  - удаление последнего usable login identity;
  - миграция без preflight по duplicate provider subjects и duplicate provider
    per user.
  - case-insensitive email duplicates при backfill `EMAIL` identity;
  - cross-account provider binding через слабый OAuth `state`;
  - потеря audit trail при unlink, если identity удаляется без отдельной записи;
  - смешивание phone/contact field с неподтвержденным phone-login provider.

## Зависит от

- [Phase 3: Admin Auth & API Security Hardening](./phase-3-admin-auth-and-api-security.md)
- [Phase 10: Client Runtime, Payments & Provider Hardening](./phase-10-client-payments-and-provider-hardening.md)
- [Phase 11: Admin Panel Refactoring](./phase-11-admin-panel-refactoring.md)
- [Phase 15: Payment & Webhook Security Hardening](./phase-15-payment-and-webhook-security-hardening.md)
- [Phase 16: Partner Referral Links](./phase-16-partner-referral-links.md)
- [Phase 17: Partner Promo Codes](./phase-17-partner-promo-codes.md)
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Promo Codes Runtime](../architecture/promo-codes-runtime.md)

## Пререквизиты

- Подтверждены текущие auth routes:
  - `POST /auth/email/send-code`;
  - `POST /auth/email/verify`;
  - `GET /auth/oauth/:provider/redirect`;
  - `GET /auth/oauth/:provider/callback`;
  - `POST /auth/telegram`;
  - `POST /auth/telegram/webapp`;
  - `GET /auth/me`.
- Подтверждено, что `JwtUserGuard` использует `sub=user.id`.
- Подтверждено, что `POST /users/find-or-create` является bot-only mutation с
  `ServiceTokenGuard`.
- Подтверждено, что bot-only `UsersService.findOrCreate()` сейчас ищет/создает
  пользователя по `User.telegramId`, но не заполняет legacy
  `authProvider/providerId`.
- Подтверждено, что live code не содержит активного phone OTP login flow:
  `User.phone` остается contact/profile field, а `PHONE` identity нельзя
  добавлять без отдельного подтвержденного auth flow.
- Подтверждено, что backend имеет Google/Yandex/VK callback routes, а текущий
  client login UI показывает только Google/Yandex + Telegram/email. Phase 18 не
  должна автоматически включать VK в user-facing UI без продуктового решения.
- Подтверждено, что текущий OAuth `state` используется как `returnTo`, а не как
  signed link nonce. Для explicit link flow нужен новый state contract.
- Подтверждено, что order/payment/referral/promo/notification ownership идет
  через canonical `User.id`.
- Перед миграцией нужен DB preflight по:
  - duplicate `telegramId`;
  - duplicate `email`;
  - duplicate `lower(trim(email))`, даже если текущий unique index не ловит
    case variants;
  - duplicate `(authProvider, providerId)`;
  - `authProvider` без `providerId` и `providerId` без `authProvider`;
  - legacy `authProvider` outside allowlist `email/telegram/google/yandex/vk`;
  - bot-only Telegram users с `telegramId`, но без legacy provider slot;
  - пользователям с заполненным `email`, но без verified email-login истории;
  - пользователям, где `authProvider/providerId` конфликтует с
    `telegramId/email`.
- До link/unlink UI нужно продуктово зафиксировать copy и поведение для:
  - provider already linked to another account;
  - email already used by another account;
  - unlink last identity;
  - Telegram identity vs Telegram notification channel.

## Архитектурные решения

- `User` не переименовывать и не превращать в auth identity. Он остается
  canonical business account.
- Ввести отдельную `UserIdentity` model:
  - `provider`;
  - `providerSubject`;
  - `email?`;
  - `emailVerified`;
  - `displayName?`;
  - `linkedAt`;
  - `lastLoginAt`;
  - `metadata?`;
  - `@@unique([provider, providerSubject])`;
  - `@@unique([userId, provider])`;
  - `@@index([userId])`.
- Legacy lowercase providers маппятся в enum явно:
  `email -> EMAIL`, `telegram -> TELEGRAM`, `google -> GOOGLE`,
  `yandex -> YANDEX`, `vk -> VK`. Неподтвержденный `phone` не маппится
  автоматически.
- `providerSubject` нормализуется перед записью:
  - `EMAIL`: `trim().toLowerCase()`;
  - `TELEGRAM`: decimal string Telegram user id;
  - OAuth providers: stable provider id (`sub`/`id`) as string.
- `UserIdentity.metadata` не хранит OAuth tokens, Telegram `initData`,
  raw provider responses или другие секреты. Только safe diagnostic fields.
- Добавить `UserIdentityAudit` или эквивалентную audit model для событий:
  `BACKFILLED`, `LINKED`, `UNLINKED`, `LOGIN_CONFLICT`, `MERGE_PREFLIGHT`,
  `MERGED`. Запись должна содержать actor type/id, target user, provider,
  providerSubject hash/masked value, reason и before/after snapshot там, где это
  применимо.
- Не использовать legacy `User.authProvider/providerId` как расширяемую модель.
  Эти поля остаются transitional compatibility fields до отдельного deprecation
  шага.
- JWT payload не должен тащить identity id как authorization subject. `sub`
  остается `User.id`; identity id может быть audit metadata, но не owner key.
- OAuth login с unknown provider subject и email, совпавшим с существующим
  `User.email`, не должен автоматически привязывать provider. Без уже
  авторизованной сессии это conflict / account-exists flow.
- Link нового provider-а разрешен только из авторизованной user session.
- OAuth link требует signed short-lived state/nonce, связанный с текущим
  `User.id`; login callback без такой link-session не имеет права attach-ить
  provider к существующему аккаунту.
- User-facing identity transport должен быть отделен от общего login
  controller: link/unlink/list endpoints живут в отдельном controller,
  domain-операции остаются в identity management service, а callback/frontend
  URL policy не размазывается по контроллерам.
- Нельзя unlink-нуть последний usable login identity.
- `UserIdentity` хранит активные способы входа. При unlink допустимо удалить
  строку только внутри transaction после записи audit event. Если будет выбран
  soft-unlink (`unlinkedAt`), migration должна добавить и протестировать raw
  partial unique index для active identities, иначе старые unlinked rows
  заблокируют повторную привязку provider subject.
- У одного canonical `User` может быть максимум одна active identity каждого
  provider-а. Смена email/OAuth provider subject идет через explicit unlink/link
  или отдельную support policy, а не через добавление второго row того же
  provider-а.
- Unlink login identity не равен удалению email/telegram notification channel.
  `User.email` и `User.telegramId` остаются contact/runtime fields до отдельной
  notification-contact модели или явной product policy.
- `User.isBlocked` policy должна быть явно подтверждена перед runtime switch:
  если заблокированный пользователь не должен логиниться, resolver обязан
  проверять canonical `User.isBlocked` перед выдачей JWT; если текущий behavior
  сохраняется, это фиксируется как отдельный security follow-up.
- Admin auth (`Admin`) не смешивать с customer identities.
- Account merge не является частью login resolver. Merge допускается только
  через admin/support flow с:
  - preflight affected assets;
  - operator identity;
  - reason;
  - transaction boundary;
  - audit log;
  - explicit conflict policy по каждому relation.
- Phase 16/17 boundaries сохраняются:
  - `ReferralLink` и `PromoCode` не объединяются;
  - partner reward ledger остается в `Transaction`;
  - owner/reward links продолжают ссылаться на canonical `User.id`.
- CloudPayments saved-card contract сохраняется:
  - token принадлежит `CloudPaymentsCardToken.userId`;
  - provider `AccountId` должен соответствовать canonical `user.id`;
  - auth linking не переносит saved cards.

## Шаги (журналы)

1. [Шаг 1. Runtime audit и identity policy lock](./phase-18/step-01-runtime-audit-and-policy-lock.md)
2. [Шаг 2. Schema, migration и identity backfill](./phase-18/step-02-schema-migration-and-backfill.md)
3. [Шаг 3. Identity resolver и login flow migration](./phase-18/step-03-identity-resolver-and-login-flows.md)
4. [Шаг 4. User-facing identities API и client UI](./phase-18/step-04-user-identities-api-and-client-ui.md)
5. [Шаг 5. Downstream ownership regression hardening](./phase-18/step-05-downstream-ownership-regression-hardening.md)
6. [Шаг 6. Admin/support duplicate preflight и merge audit](./phase-18/step-06-admin-support-merge-preflight-and-audit.md)
7. [Шаг 7. Verification, rollout и wiki sync](./phase-18/step-07-verification-rollout-and-wiki-sync.md)

## Верификация

- Existing email-login user:
  - логинится через email OTP;
  - получает тот же `user.id`;
  - видит те же заказы, баланс, referral stats и saved-card state.
- Existing Telegram user:
  - `/start` в bot не создает дубль;
  - Mini App cold start через `/auth/telegram/webapp` получает тот же `user.id`;
  - Telegram notifications продолжают уходить на корректный chat id.
- OAuth:
  - новый Google/Yandex/VK subject создает `UserIdentity`;
  - повторный вход тем же provider subject возвращает тот же `user.id`;
  - совпавший email без link не делает silent provider attach.
- Link/unlink:
  - авторизованный пользователь может привязать новый provider;
  - provider, уже принадлежащий другому `User`, возвращает conflict;
  - последняя identity не удаляется;
  - unlink не удаляет email/telegram notification target без отдельного
    явного действия.
- Ownership:
  - `Order.userId`, `Transaction.userId`, `CloudPaymentsCardToken.userId`,
    `ReferralLink.userId`, `PromoCode.referralOwnerId`,
    `PushSubscription.userId` не меняются при простом link/unlink;
  - purchase completion, partner rewards, cashback и loyalty используют
    canonical `User.id`;
  - saved-card charge продолжает отправлять `AccountId=user.id`.
- Admin/support:
  - duplicate preflight показывает affected assets до mutation;
  - default для Phase 18 — read-only preflight; merge mutation включается только
    если по каждой affected relation утвержден conflict policy;
  - merge mutation, если включена в этой фазе, пишет audit log и не запускается
    из login flow.
- Automated baseline:
  - `npx jest src/modules/auth/ --runInBand`;
  - `npx jest src/modules/users/ --runInBand`;
  - `npx jest src/modules/referrals/ --runInBand`;
  - targeted `orders.service.spec.ts`;
  - targeted `payments.service.spec.ts`;
  - `npx tsc --noEmit -p tsconfig.json` в backend;
  - `npx tsc --noEmit` в client/admin/bot при затрагивании клиента.
- Migration/documentation baseline:
  - dry-run/preflight report не содержит блокирующих duplicate identities;
  - migration comments содержат rollback note для raw/partial indexes, если они
    добавляются;
  - `git diff --check`.

## Журнал

### 2026-06-06

- Phase 18 создана после чтения `docs/work/session.md`, phase authoring guide,
  architecture wiki и live runtime audit по `auth`, `users`, `orders`,
  `payments`, `referrals`, `promo-codes`, `notifications`, `client`, `admin` и
  `bot`.
- Зафиксирован policy lock: account linking нельзя начинать с UI-кнопок поверх
  `User.authProvider/providerId`; нужна отдельная identity model и migration.
- Зафиксирован запрет silent merge/link по одному email.
- Зафиксировано, что `User.id` остается владельцем business assets, а
  `UserIdentity` отвечает только за login methods.
- Создана runtime wiki страница
  [Auth Identity Runtime](../architecture/auth-identity-runtime.md).

### 2026-06-07

- Дополнительно сверены live `AuthService`, `AuthController`, `JwtUserGuard`,
  `UsersService`, bot API/commands, Prisma ownership relations, orders,
  payments, referrals, partner rewards, promo codes и notification surfaces.
- Зафиксированы дополнительные guardrails: no phone provider без live flow,
  no VK user-facing UI auto-enable, signed OAuth link state обязателен,
  email backfill проверяет normalized duplicates, link/unlink требует audit
  trail.
- Зафиксировано, что default для support merge в Phase 18 — read-only preflight;
  data-moving merge допускается только после утвержденной per-relation policy.
- Локально реализован Step 2 additive schema/backfill контур: Prisma
  `UserIdentity`/`UserIdentityAudit`, ручная миграция, dry-run/apply CLI и
  разделенные SRP-компоненты `identity-backfill/*`. Login resolver, public
  auth routes, UI и data-moving merge пока не переключались.
- Backfill CLI дополнительно усилен как operator surface: запись требует
  `--apply --confirm-phase18-identity-backfill`, unknown args не
  игнорируются, `--apply` без confirm-флага завершается до DB connect, а
  stdout содержит operator report без internal candidates.
- Локально реализован Step 3 identity resolver: email/OAuth/Telegram/bot login
  paths идут через `UserIdentity`, OAuth email collision больше не делает
  silent attach, bot-only Telegram continuity сохраняет canonical `User.id`,
  `User.isBlocked` проверяется до выдачи login result. Explicit link/unlink UI
  и signed OAuth link-state еще не реализованы.
- Email login fallback дополнительно hardened: legacy `users.email` ищется
  normalized/case-insensitive, один match сохраняет canonical `User.id`, а
  несколько matches дают `EMAIL_NORMALIZED_DUPLICATE` вместо случайного выбора
  аккаунта.
- Локально реализован Step 4 user-facing identities API/UI: список identities,
  signed OAuth link-state для Google/Yandex, email link через код, Telegram
  link через verified Telegram payload, unlink с audit и запретом удалить
  последний способ входа. VK не показывается в клиентском provider list.
- OAuth link provider allowlist дополнительно закреплен в общем typed contract:
  controller отклоняет provider вне `google/yandex` до построения callback URL,
  а service повторно защищает management boundary.
- Локально закрыт Step 5 regression hardening: добавлены auth-boundary tests
  на JWT `sub=user.id` и отсутствие business ownership/contact-field мутаций
  при link/unlink; прогнаны targeted orders/payments/referrals/promo suites.
- Локально реализован Step 6 read-only admin/support preflight:
  `GET /users/admin/merge-preflight` показывает affected assets и blocking
  conflicts, но `canMerge=false`, `mutationEnabled=false`; data-moving merge
  mutation не добавлялась.
- Локально закрыт Step 7 verification/wiki sync: latest affected backend suite
  по `auth/users/orders/payments/referrals/promo-codes/backfill-cli` прошел
  22 suites / 200 tests, backend/client/admin/bot type-check прошли, Prisma
  schema validated,
  wiki обновлена. Phase 18 остается pending к deploy до DB migration,
  identity backfill dry-run/apply и ручного smoke на живой БД/интеграциях.
- Дополнительный hardening pass закрыл collision по `EMAIL` identity:
  OAuth login/link больше не может обойти занятый email, если он хранится в
  `UserIdentity(EMAIL, providerSubject)`, даже когда `User.email` у владельца
  пустой.
- Дополнительный hardening pass закрыл callback/race cases: invalid signed
  OAuth link-state больше не запускает login fallback в controller, а
  concurrent unique race при создании identity возвращает controlled provider
  conflict вместо raw Prisma error.
- Дополнительный hardening pass закрыл OAuth returnTo normalization: обычный
  OAuth login `state` теперь нормализуется на backend как relative path перед
  `/login/callback`, а external/protocol-relative/backslash/malformed значения
  сбрасываются в `/`.
- Дополнительный hardening pass закрыл input contracts новых identity-link
  routes: fixed-shape payloads вынесены в DTO и проходят global
  `ValidationPipe`.
- Дополнительный hardening pass закрыл input contracts старых auth/bot routes,
  которые теперь входят в identity runtime: email OTP login, Telegram WebApp
  auth и bot `users/find-or-create` переведены на DTO. Telegram Widget payload
  остается динамическим для signature verification.
- Дополнительный hardening pass закрепил provider-per-user invariant:
  `UserIdentity` имеет unique `(userId, provider)`, backfill preflight ловит
  duplicate provider subjects для одного user, а runtime link/resolver
  возвращает controlled conflict вместо создания второго row.
- Дополнительный hardening pass закрыл audit gap: OAuth/email/provider
  collisions и explicit link conflicts теперь пишут `LOGIN_CONFLICT` audit с
  hash/masked subject и safe metadata. Публичные conflict responses не
  раскрывают owner `User.id`, а audit для неуспешного link пишется вне
  rollback-transaction.
- Дополнительный hardening pass закрыл audit snapshot privacy gap: `LINKED`,
  `UNLINKED` и `BACKFILLED` snapshots больше не хранят raw email или raw
  `providerSubject`; email фиксируется через `emailHash/emailPreview`.
- Дополнительный hardening pass закрыл merge-preflight audit gap:
  `GET /users/admin/merge-preflight` пишет `MERGE_PREFLIGHT` audit для source и
  target user с actor/conflict/asset metadata, но не переносит и не обновляет
  business rows.
- Дополнительный hardening pass закрыл merge-preflight response privacy gap:
  identity list в admin/support preflight больше не возвращает raw
  `providerSubject`; наружу идут hash/masked preview, а duplicate email details
  тоже маскируются.
- Дополнительный hardening pass закрыл contact-email split-brain gap:
  `PATCH /users/me/email` теперь валидируется через DTO и проверяет занятость
  email не только в `users.email`, но и в `UserIdentity(EMAIL)`.
- Дополнительный hardening pass закрыл Telegram split-brain gap: Telegram
  login/link теперь блокирует ситуацию, где `TELEGRAM` identity одного `User`
  конфликтует с `users.telegramId` другого `User` или расходится с contact
  field своего owner.
- Дополнительный SRP hardening pass разделил auth transport: user-facing
  identities/link/unlink endpoints вынесены в `AuthIdentityController`, расчет
  OAuth callback/frontend URL вынесен в `AuthCallbackUrlService`, а
  `AuthController` оставлен за login/callback и `/auth/me`.
- Дополнительный SRP hardening pass разделил admin merge preflight:
  `UserMergePreflightService` оставлен за read-only report/conflict policy,
  affected asset counts вынесены в `UserMergePreflightAssetsService`, а
  `MERGE_PREFLIGHT` audit write/metadata — в
  `UserMergePreflightAuditService`.

## Ссылки

- [Корневой документ wiki](../README.md)
- [Project Phases & Roadmap](./README.md)
- [Phase Authoring Guide](./PHASE_AUTHORING_GUIDE.md)
- [Auth Identity Runtime](../architecture/auth-identity-runtime.md)
- [System Overview](../architecture/system-overview.md)
- [Module Map](../architecture/module-map.md)
- [Payment Flow Audit](../architecture/payment-flow-audit.md)
- [Referral Runtime](../architecture/referrals-runtime.md)
- [Promo Codes Runtime](../architecture/promo-codes-runtime.md)
