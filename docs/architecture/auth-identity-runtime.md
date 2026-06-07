# Auth Identity Runtime

> [Корневой документ wiki](../README.md)

> Runtime audit для подготовки Phase 18: Account Identity Linking & Merge.
> Source of truth — текущий код и Prisma schema, затем этот документ.

## Scope

Документ фиксирует:

- текущие способы входа пользователя;
- чем сейчас является `User`;
- почему `User.authProvider/providerId` нельзя расширять точечными патчами;
- целевую границу между canonical business account и login identities;
- affected surfaces, которые нельзя ломать при account linking или merge.

Admin auth (`Admin`, `JwtAdminGuard`, admin JWT) остается отдельным контуром и
не входит в customer account linking.

## Source Of Truth

- `backend/prisma/schema.prisma`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/auth-identity.controller.ts`
- `backend/src/modules/auth/auth-callback-url.service.ts`
- `backend/src/modules/auth/oauth.service.ts`
- `backend/src/modules/auth/identity/*`
- `backend/src/modules/auth/identity-backfill/*`
- `backend/src/modules/auth/identity-management/*`
- `backend/src/modules/auth/identity-resolver/*`
- `backend/src/common/auth/jwt-user.guard.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.controller.ts`
- `backend/src/modules/users/user-merge-preflight*.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/payments/cloudpayments.service.ts`
- `backend/src/modules/payments/payments.service.ts`
- `backend/src/modules/referrals/referrals.service.ts`
- `backend/src/modules/referrals/partner-rewards.service.ts`
- `backend/src/modules/promo-codes/promo-codes.service.ts`
- `backend/src/modules/notifications/push.service.ts`
- `client/components/AuthProvider.tsx`
- `client/app/login/page.tsx`
- `client/app/login/callback/page.tsx`
- `client/lib/auth.ts`
- `bot/src/api.ts`
- `bot/src/commands/index.ts`

## Current Runtime Contract

### `User` Сейчас

`User` является не только login record. Это canonical business account:

- владелец баланса и `bonusBalance`;
- владелец заказов и выданных eSIM через `Order.userId`;
- владелец payment history через `Transaction.userId`;
- владелец saved-card tokens CloudPayments через `CloudPaymentsCardToken.userId`;
- referral subject через `referredById`, `referralLinkId`, `referralCode`;
- владелец `ReferralLink` и partner promo policy через `PromoCode.referralOwnerId`;
- получатель Telegram/email/web-push уведомлений;
- source of truth для loyalty через `totalSpent` и `loyaltyLevelId`.

Следствие: login linking не имеет права переносить или объединять `User` без
явного account merge сервиса, preflight и audit trail.

### Legacy Identity Поля

В `User` сейчас есть один legacy slot:

```prisma
telegramId   BigInt? @unique
email        String? @unique
authProvider String?
providerId   String?

@@index([authProvider, providerId])
```

Этот контракт не выражает несколько независимых способов входа. Он может
описать только один текущий provider slot и набор side-channel полей.

`phone` в `User` сейчас является profile/contact field. Live phone-login flow в
коде не найден, поэтому Phase 18 не должна автоматически добавлять `PHONE`
identity provider.

### User JWT

`JwtUserGuard` принимает только user token с payload:

```ts
{ sub: user.id, type: 'user', provider: user.authProvider }
```

`sub` уже является правильной canonical boundary: все downstream endpoints
должны брать `userId` из JWT, а не из body. `provider` в payload — legacy hint,
а не durable authorization source.

### Login Flows

Email OTP:

- `POST /auth/email/send-code` отправляет код на email;
- `POST /auth/email/verify` после успешной проверки вызывает
  `AuthService.loginWithEmail(email)`;
- `loginWithEmail()` ищет `User` по `email`, иначе создает `User` с
  `authProvider='email'` и `providerId=email`.

OAuth:

- Google/Yandex/VK callbacks получают `OAuthProfile`;
- `loginWithOAuth()` ищет пользователя по `(authProvider, providerId)`;
- для Telegram дополнительно ищет по `telegramId`;
- затем ищет по `email`, если profile содержит email;
- если user найден и `authProvider` пустой, legacy slot заполняется текущим
  provider;
- если user найден с другим provider slot, durable identity link не создается.
- Текущий OAuth `state` используется как return redirect (`returnTo`), а не как
  signed link nonce. Explicit link flow должен ввести отдельный state contract.

Telegram:

- Telegram Login Widget и Telegram WebApp проходят через
  `loginWithOAuth(profile provider='telegram')`;
- bot flow вызывает `POST /users/find-or-create` с `ServiceTokenGuard` и ищет
  `User` по `telegramId`;
- referral bot path дополнительно сверяет expected `telegramId` в
  `ReferralsService.registerReferral()`.

Client:

- `client/components/AuthProvider.tsx` хранит JWT и user snapshot в
  `localStorage`;
- Telegram WebApp cold start получает fresh JWT через `/auth/telegram/webapp`;
- web login callback получает token из query и затем вызывает `/auth/me`;
- `authProvider` сейчас отображается как один provider hint.
- `client/app/login/page.tsx` показывает Google/Yandex, email и Telegram. VK
  backend callback существует, но VK не является текущей user-facing кнопкой
  входа.

## Current Gaps

- Один `User.authProvider/providerId` не может хранить Google + Yandex + VK +
  Telegram + email для одного пользователя.
- Совпадение email в OAuth flow сейчас может привести к login в существующий
  `User`, но это не создает durable identity-link record.
- Email в `User.email` одновременно используется как login lookup, checkout
  contact и email notification target.
- `telegramId` одновременно является login subject, bot lookup key и Telegram
  notification chat id.
- Нет явного `/auth/identities/me`, link/unlink API и audit trail.
- Нет admin/support merge preflight: нельзя безопасно объединять два `User`
  только по совпавшему email или provider payload.
- Нет signed OAuth link state, привязанного к текущему `User.id`.
- Нет normalized email preflight по `lower(trim(email))` для backfill.
- Нет audit trail для будущих link/unlink событий.

## Target Contract For Phase 18

### Canonical Boundary

- `User` остается canonical business account.
- `UserIdentity` отвечает только за способы входа.
- JWT продолжает выдаваться на canonical `user.id`.
- Downstream modules не должны знать, каким provider-ом пользователь вошел.
- `Admin` auth остается отдельным contour.

### Proposed Prisma Contract

```prisma
enum AuthIdentityProvider {
  EMAIL
  TELEGRAM
  GOOGLE
  YANDEX
  VK
}

model UserIdentity {
  id              String               @id @default(cuid())
  userId          String
  provider        AuthIdentityProvider
  providerSubject String
  email           String?
  emailVerified   Boolean              @default(false)
  displayName     String?
  linkedAt        DateTime             @default(now())
  lastLoginAt     DateTime?
  metadata        Json?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerSubject])
  @@unique([userId, provider])
  @@index([userId])
}
```

`PHONE` intentionally absent, пока live phone auth flow не появится и не будет
описан отдельным contract.

`providerSubject` — это стабильный provider id:

- `EMAIL`: normalized email;
- `TELEGRAM`: Telegram user id;
- `GOOGLE`: Google `sub`;
- `YANDEX`: Yandex `id`;
- `VK`: VK `id`.

Legacy lowercase values маппятся явно:

- `email -> EMAIL`;
- `telegram -> TELEGRAM`;
- `google -> GOOGLE`;
- `yandex -> YANDEX`;
- `vk -> VK`.

`UserIdentity.metadata` не хранит OAuth tokens, Telegram `initData`, raw
provider responses или другие секреты. Только safe diagnostic fields.

Отдельный audit trail обязателен для:

- `BACKFILLED`;
- `LINKED`;
- `UNLINKED`;
- `LOGIN_CONFLICT`;
- `MERGE_PREFLIGHT`;
- `MERGED`, если mutation merge включается в фазе.

`LOGIN_CONFLICT` audit не должен хранить raw provider subject, OAuth payload,
Telegram `initData` или полный email. Для support/security допустимы только
provider, hash/masked preview, structured reason code, actor, attempted user и
conflicting user. Публичный HTTP conflict response не должен раскрывать owner
`User.id`; этот id остается только в audit metadata.

`LINKED`, `UNLINKED` и `BACKFILLED` snapshots также не хранят raw
`providerSubject` или raw email. Runtime rows могут хранить `UserIdentity.email`
как рабочее поле, но audit trail фиксирует email только через
`emailHash/emailPreview`.

### Backfill Rules

Backfill должен быть явным и проверяемым:

- из `User.telegramId` создать `TELEGRAM` identity;
- из `User.authProvider/providerId` создать соответствующую identity;
- из `User.email` создать или подготовить `EMAIL` identity без потери текущего
  email-login поведения;
- bot-only Telegram users с `telegramId`, но без `authProvider/providerId`,
  получают `TELEGRAM` identity из `telegramId`;
- preflight проверяет duplicate `lower(trim(email))`, unknown provider values,
  `authProvider` без `providerId`, `providerId` без `authProvider` и
  расхождения legacy telegram provider subject с `User.telegramId`;
- preflight блокирует несколько provider subjects одного provider для одного
  user; target-state contract — максимум одна active identity каждого provider
  на canonical `User`;
- все конфликты уникальности должны попадать в preflight report, а не
  резолвиться автоматическим merge-ом;
- legacy поля остаются до полного переключения login flows и отдельного
  deprecation step.

### Step 2 Local Implementation

Локально добавлен additive backend-контур для schema/backfill без переключения
runtime login resolver:

- `UserIdentityCandidateBuilder` — только mapping legacy `User` row в
  identity candidates и row-level issues;
- `UserIdentityPreflightService` — только read-only DB scan и conflict report;
- `UserIdentityBackfillApplier` — только transaction, idempotent create и
  audit `BACKFILLED`;
- `UserIdentityBackfillService` — orchestration для `dry-run/apply`;
- `user-identity-normalizer.ts` и `user-identity-privacy.ts` держат чистые
  функции нормализации, hash и masked preview.

CLI `phase18:identity-backfill` по умолчанию запускает dry-run. Запись
идентичностей возможна только через
`--apply --confirm-phase18-identity-backfill` и только если preflight не нашел
blocking `error` issues. CLI parse/report слой вынесен отдельно от backfill
service: unknown args не игнорируются, `--apply` без confirm-флага не
подключается к БД, stdout отдает operator report с counts/issues без internal
candidates. `plannedIdentities` в отчете означает pending writes: уже
существующие identities того же `User` повторно не планируются. Apply-транзакция
имеет явный timeout для production/operator запусков через public DB URL.

Backfill не является пользовательским merge-инструментом. Он не объединяет
разные `User`, не переносит заказы, баланс, saved cards, referrals, partner
promo ownership или notification contacts. Его задача — один раз после
production deploy создать отсутствующие `UserIdentity` rows из legacy
`users.email`, `users.telegramId` и `users.authProvider/providerId`, чтобы старые
аккаунты продолжили входить через новый resolver.

### Login Resolver Rules

- Сначала искать `UserIdentity(provider, providerSubject)`.
- Если identity найдена, выдать JWT на `identity.userId` и обновить
  `lastLoginAt`.
- Если identity не найдена и provider payload не конфликтует, создать нового
  `User` и `UserIdentity`.
- Если OAuth profile email совпал с существующим `User.email`, но
  `(provider, providerSubject)` не привязан, не делать silent link. User должен
  войти существующим способом и явно привязать provider.
- Email collision возвращает structured conflict code/safe message, а не raw
  provider error и не скрытый login в чужой canonical account.
- Email OTP после успешного кода может создать/подтвердить `EMAIL` identity для
  текущего unique email, сохранив текущую user-facing модель входа по email.
- Telegram bot find-or-create должен использовать тот же identity resolver или
  совместимый adapter, но не обходить target identity contract.
- Resolver должен явно проверить `User.isBlocked` policy перед выдачей JWT или
  оставить это как документированный security follow-up.

### Step 3 Local Implementation

Локально `AuthService` больше не ищет user по legacy
`authProvider/providerId` сам. Он вызывает `AuthIdentityResolverService`, а сам
остается фасадом для admin auth, `/auth/me` и JWT issuance.

Текущий resolver contract:

- email OTP: `EMAIL` identity lookup/create; existing `User.email` получает
  identity только после успешной проверки email-кода;
- legacy email fallback делает normalized case-insensitive lookup по
  `users.email`: один match сохраняет canonical `User.id`, несколько matches
  возвращают `EMAIL_NORMALIZED_DUPLICATE` и пишут `LOGIN_CONFLICT` audit;
- email OTP login payloads проходят DTO validation; inline body types не
  являются runtime validation contract;
- OAuth/Telegram login: lookup по `(provider, providerSubject)`;
- Telegram WebApp login payload проходит DTO validation; Telegram Widget payload
  остается динамическим для signature verification;
- обычный OAuth login callback нормализует `state` в safe relative `returnTo`
  перед редиректом на `/login/callback`; signed link-state использует тот же
  relative-returnTo helper с fallback `/profile`;
- exact legacy provider continuity: если identity еще нет, но есть тот же
  verified legacy provider subject, resolver создает identity для того же
  `User.id`;
- Telegram bot-only continuity: verified Telegram subject может создать
  `TELEGRAM` identity для existing `User.telegramId`;
- Telegram login через existing identity блокируется controlled conflict, если
  этот Telegram subject одновременно является `users.telegramId` другого
  аккаунта или расходится с `User.telegramId` самого identity owner;
- OAuth email collision: если provider subject неизвестен, а profile email уже
  занят другим `User.email` или `UserIdentity(EMAIL, providerSubject)`,
  resolver возвращает `OAUTH_EMAIL_ALREADY_USED` и не attach-ит provider;
- OAuth/email/provider conflicts пишут audit `LOGIN_CONFLICT` с hash/masked
  provider subject и safe metadata; owner `User.id` не возвращается в публичном
  response;
- provider create races и второй active provider для одного `User` возвращают
  controlled conflict и тоже попадают в `LOGIN_CONFLICT` audit после rollback
  неуспешной транзакции;
- bot `users/find-or-create`: идет через
  `resolveTelegramBotUser()` и не создает отдельный обходной auth path;
- bot `users/find-or-create` принимает DTO с numeric Telegram id и bounded
  optional profile/UTM fields перед `BigInt(telegramId)`;
- `UserIdentity.lastLoginAt` обновляется при login;
- `User.isBlocked` блокирует выдачу login result;
- JWT остается `sub=user.id`, provider в payload — last-login hint.

Ограничения текущего шага:

- signed OAuth `action=link` state еще не реализован;
- `/auth/identities/me`, explicit link/unlink API и client UI относятся к
  следующим шагам;
- data-moving account merge все еще запрещен в login flow.

### Explicit Link / Unlink

- Link нового provider-а — только действие уже авторизованного пользователя.
- OAuth link требует signed short-lived state/nonce с `action=link`, связанным
  с текущим `User.id`. Login callback без такой link-session не attach-ит
  provider к существующему аккаунту.
- Если `(provider, providerSubject)` уже принадлежит другому `User`, возвращать
  conflict и вести пользователя/support в merge flow.
- Нельзя удалить последний usable login identity.
- Unlink login identity не должен молча удалять contact channel:
  `User.email` и `User.telegramId` сейчас используются для уведомлений и требуют
  отдельной product policy перед удалением.
- Если unlink удаляет активную `UserIdentity`, audit event пишет masked/snapshot
  данные до удаления. Если выбран soft-unlink через `unlinkedAt`, нужна raw
  partial unique index для active identities, иначе unlinked rows заблокируют
  повторную привязку provider subject.

### Step 4 Local Implementation

Локально добавлен user-facing management surface:

- transport boundary разделен: `AuthController` отвечает за admin/email/OAuth/
  Telegram login callbacks и `/auth/me`, `AuthIdentityController` держит только
  user-facing identities/link/unlink endpoints, а OAuth callback/frontend URL
  policy вынесена в `AuthCallbackUrlService`;
- `GET /auth/identities/me` возвращает текущие identities и доступный
  user-facing provider list;
- `POST /auth/identities/link/oauth/:provider/start` создает signed
  short-lived state для Google/Yandex link flow;
- OAuth link provider allowlist находится в одном typed contract
  `OAUTH_IDENTITY_LINK_PROVIDERS`; controller отклоняет provider вне
  `google/yandex` до построения callback URL и до вызова management service;
- фиксированные body payloads для OAuth start, email link и Telegram WebApp
  link описаны DTO-классами и проходят global `ValidationPipe`; Telegram Widget
  payload остается динамическим, потому что signature verification требует
  исходный набор Telegram-полей;
- OAuth callback с valid link-state привязывает provider к текущему `User.id`;
- invalid/expired signed-like link-state не падает в login fallback;
- публичный OAuth callback при invalid signed-like link-state редиректит в
  `/profile?identityLink=error`, а не в обычный `/login` flow;
- `returnTo` внутри signed link-state проходит backend normalization и не
  принимает backslash/encoded-backslash variants;
- email link требует email code verification;
- explicit email link проверяет email collision не только по `User.email`, но и
  по уже существующей `EMAIL` identity другого пользователя;
- explicit OAuth link из авторизованной сессии не блокируется из-за contact
  email другого legacy аккаунта: для Google/Yandex link canonical key —
  `(provider, providerSubject)`, а provider email хранится как metadata/label и
  не переносит `User.email`, `EMAIL` identity или business rows;
- `PATCH /users/me/email` остается contact-field update, но проходит DTO
  validation и запрещает сохранить email, уже занятый `UserIdentity(EMAIL)`
  другого пользователя;
- static users routes, включая `GET /users/push/vapid-public-key`, объявлены до
  параметрических `:id` routes;
- concurrent unique race при создании identity возвращает controlled provider
  conflict, а не raw Prisma error;
- explicit link conflicts пишут `LOGIN_CONFLICT` audit вне откатываемой
  link-транзакции: rollback не уничтожает support/security след, а публичная
  ошибка не раскрывает raw provider subject или чужой `User.id`;
- backend запрещает второй active identity того же provider для одного
  canonical `User`; для смены provider subject нужен explicit unlink/link или
  отдельная support policy;
- Telegram link доступен через verified Telegram Widget/WebApp payload; client
  profile использует Mini App `initData` внутри Telegram и Telegram Login
  Widget в обычном web-контексте;
- explicit Telegram link не меняет `User.telegramId`, но запрещает привязку,
  если verified Telegram subject уже является `users.telegramId` другого
  пользователя;
- `DELETE /auth/identities/:id` запрещает unlink последней identity и пишет
  audit `UNLINKED` перед физическим удалением row;
- client profile показывает только `EMAIL`, `TELEGRAM`, `GOOGLE`, `YANDEX`.
  `VK` backend route остается неавтоматизированным user-facing provider.

Ограничения текущего шага:

- link/unlink не меняет `User.email` и `User.telegramId` как contact channels;
- browser smoke нужно выполнить после применения миграции/backfill на dev DB;
- admin/support merge controls не добавлены в пользовательский UI.

### Merge Boundary

Автоматический merge запрещен в login flow.

Admin/support merge может появиться только после отдельного preflight. Default
для Phase 18 — read-only preflight; data-moving merge включается только после
утвержденной per-relation conflict policy:

- source user и target user;
- список affected assets: orders, eSIM, transactions, balances, saved cards,
  referral ownership, promo ownership, push subscriptions, notifications;
- конфликтные provider identities;
- финансовый ledger и partner reward history;
- audit log с оператором, причиной, timestamps и before/after snapshot.

До фиксации per-surface merge policy mutation merge должен быть read-only
diagnostic/preflight, а не перенос данных.

### Step 6 Local Implementation

Локально добавлен read-only admin/support preflight:

- `GET /users/admin/merge-preflight` доступен только через `JwtAdminGuard`;
- вход: `sourceUserId` и `targetUserId`;
- preflight boundary разделен: `UserMergePreflightService` собирает read-only
  report и conflict policy, `UserMergePreflightAssetsService` считает affected
  assets, `UserMergePreflightAuditService` пишет `MERGE_PREFLIGHT` audit;
- сервисы собирают snapshots source/target users, identities и affected counts
  по orders, transactions, saved cards, referral links, owned promo codes,
  promo redemptions, reward snapshots, push subscriptions и notifications;
- preflight выставляет blocking conflicts для баланса/bonus balance, duplicate
  normalized email, Telegram contact drift, legacy provider drift, saved-card
  ownership, referral-link ownership и partner-promo ownership;
- response всегда содержит `canMerge=false`, `mutationEnabled=false` и
  required policy note;
- identity list в response является safe view: raw `providerSubject` наружу не
  возвращается, только hash и masked preview; duplicate email conflict details
  также используют hash/masked email;
- сервис пишет `MERGE_PREFLIGHT` audit для source и target user с actor,
  conflict codes и asset counts, но без raw identity subjects;
- сервис не переносит business rows. Audit write считается security/support
  trail, а не data-moving merge mutation. Data-moving merge остается
  запрещенным до отдельной утвержденной per-relation policy.

## Affected Surfaces

### Must Stay Owned By `User.id`

- `Order.userId`
- `Transaction.userId`
- `CloudPaymentsCardToken.userId` и `accountId`
- `ReferralLink.userId`
- `PromoCode.referralOwnerId`
- `PromoCodeRedemption.userId`
- `PromoCodeRedemption.rewardOwnerIdSnapshot`
- `PushSubscription.userId`
- `Notification.userId`
- `User.balance`, `bonusBalance`, `totalSpent`, `loyaltyLevelId`

### Runtime Flows To Verify

- email OTP login;
- Google/Yandex/VK OAuth login and callback redirect;
- OAuth link signed state / expired state / provider-conflict cases;
- Telegram Login Widget;
- Telegram WebApp cold start;
- bot `/start` + `users/find-or-create`;
- `/auth/me`;
- checkout order create with email update;
- saved-card repeat charge;
- balance top-up;
- referral registration web/bot;
- partner promo reward completion;
- Telegram/email/push notifications.

## Verification Baseline

Backend:

```bash
npx jest src/modules/auth/ src/modules/users/ src/modules/orders/orders.service.spec.ts src/modules/payments/cloudpayments.service.spec.ts src/modules/payments/payments.service.spec.ts src/modules/referrals/ src/modules/promo-codes/ --runInBand
npx jest src/modules/auth/ --runInBand
npx jest src/modules/users/ --runInBand
npx jest src/modules/referrals/ --runInBand
npx jest src/modules/orders/orders.service.spec.ts --runInBand
npx jest src/modules/payments/payments.service.spec.ts --runInBand
npx tsc --noEmit -p tsconfig.json
npx prisma validate
```

Client/Admin/Bot:

```bash
# client
npx tsc --noEmit

# admin
npx tsc --noEmit

# bot
npx tsc --noEmit
```

Manual smoke:

- existing email user logs in and sees the same orders/balance;
- existing Telegram bot user opens Mini App and receives the same `user.id`;
- Google/Yandex/VK first login with new subject creates one new user identity;
- OAuth with email of an existing account does not silently attach provider;
- OAuth link without signed state does not create identity;
- authorized user links a new provider and can login with both methods;
- unlink refuses to remove the last login identity;
- unlink writes audit and does not delete `User.email`/`User.telegramId`;
- referral attribution and partner rewards remain attached to canonical `User.id`;
- saved-card charge still uses `AccountId == user.id`.

## Links

- [Phase 18: Account Identity Linking & Merge](../phases/phase-18-account-identity-linking-and-merge.md)
- [Payment Flow Audit](./payment-flow-audit.md)
- [Referral Runtime](./referrals-runtime.md)
- [Promo Codes Runtime](./promo-codes-runtime.md)
- [Gotchas](./gotchas.md)
