# Auth Identity Runtime

> [Корневой документ wiki](../README.md)

> Runtime audit для подготовки Phase 18: Account Identity Linking & Merge.
> Source of truth — текущий код и Prisma schema, затем этот документ.
> Подробности реализации см. в шагах фазы: [Phase 18](../phases/phase-18-account-identity-linking-and-merge.md).

## Scope

Документ фиксирует:
- текущие способы входа пользователя;
- чем сейчас является `User`;
- целевую границу между canonical business account и login identities;
- affected surfaces, которые нельзя ломать при account linking или merge.

Admin auth (`Admin`, `JwtAdminGuard`, admin JWT) остается отдельным контуром.

## Source Of Truth
- `backend/prisma/schema.prisma`
- `backend/src/modules/auth/*`
- `backend/src/modules/users/*`
- `client/lib/auth.ts` и `client/components/AuthProvider.tsx`
- `bot/src/api.ts` и `bot/src/commands/index.ts`

## Current Runtime Contract

### `User` — Canonical Business Account
`User` — это не просто login record, а владелец:
- балансов (`balance`, `bonusBalance`);
- заказов (`Order.userId`) и `Transaction.userId`;
- сохраненных карт (`CloudPaymentsCardToken.userId`);
- реферальных связей и промокодов;
- настроек уведомлений.

Следствие: login linking не переносит и не объединяет `User` без явного merge-сервиса и audit trail.

### Current Identity Fields
В `User` сейчас есть:
```prisma
telegramId   BigInt? @unique
email        String? @unique
authProvider String?
providerId   String?
```
`authProvider/providerId` остаются legacy deprecation slot, а не расширяемой
моделью входов. После Phase 20 Step 04 они не являются response contract для
admin users read model, `/auth/me` и user-facing responses из `UsersController`.

User-facing users responses (`GET /users/:id`, bot `find-or-create`,
`PATCH /users/me/email`) проходят через whitelist-owner
`users/user-profile-read-model.ts` (`toUserProfileReadModel`), а не через
blacklist-scrub полей. Проекция отдает только контрактные скаляры + собственный
`loyaltyLevel`, поэтому legacy slot и чужие связанные записи (`referredBy`,
`referrals`) структурно не попадают в ответ. Admin surface владеет отдельным
read model (`users/admin-user-read-model.ts`).

`GET /orders/:id` и внутренние order/payment workflows используют отдельную
order-scoped проекцию `orders/order-detail-user-read-model.ts`. Вложенный
`order.user` содержит только `id`, contact/display-поля, необходимые текущим
workflow (`telegramId`, `email`, `username`, `firstName`, `lastName`). Полные
relation-объекты `referredBy`/`referrals`, referral attribution fields, legacy
slot `authProvider/providerId`, балансы и прочие поля canonical `User` в order
detail структурно не выбираются и дополнительно не проходят whitelist-mapper.
Referral accounting получает `referredById`/`referralLinkId` своей внутренней
проекцией и не зависит от HTTP order detail. Расширенный admin-профиль
пользователя остается контрактом users-модуля и не встраивается в ответ заказа.

Owner-facing order routes (`GET /orders/:id`, `GET /orders/user/:userId`,
`check-new` и ответ `fulfill-free`) не возвращают внутренний Prisma payload.
Контроллер преобразует их в `UserOrderReadModel`/`CheckoutOrder`: без вложенного
`user`, `transactions`, `repeatChargeAttempt`, `providerResponse`, provider
identifiers/costs и accounting diagnostics. Admin-ветка под `JwtAdminGuard`
сохраняет диагностический order context; client-контракт владеется
`shared/contracts/user-order.ts`.

Schema drop пока заблокирован live consumers:
- `AuthIdentityResolverService` еще использует legacy exact-provider lookup
  для continuity и пишет slot при создании OAuth/email users;
- Phase 18 identity backfill использует slot как источник кандидатов и
  диагностики конфликтов;
- `UserMergePreflightService` сверяет slot с `UserIdentity` для drift-warning.

До снятия этих blockers поля остаются в schema и индексе, но UI/API не должны
использовать их как fallback для отображения способов входа. `phone` в `User`
является contact-полем, live phone-login потока нет.

### User JWT
`JwtUserGuard` принимает токен: `{ sub: user.id, type: 'user', provider }`.
`sub` — это canonical boundary. `provider` — hint от текущего
`UserIdentity` resolver-а, а не чтение `User.authProvider`.

### Login Flows
- **Email OTP**: `POST /auth/email/verify` ищет/создает `User` по `email`.
- **OAuth (Google/Yandex/VK)**: сначала ищет `UserIdentity`, затем держит
  legacy exact-provider fallback по `(authProvider, providerId)` для
  continuity старых аккаунтов. Если email совпал с другим аккаунтом,
  возвращает conflict и не делает silent link.
- **Telegram (Bot)**: `POST /users/find-or-create` ищет по `telegramId`.
- **Telegram (WebApp initData)**: `verifyTelegramWebAppInitData` проверяет HMAC и freshness `auth_date` с окном 1 час (`TELEGRAM_WEBAPP_AUTH_DATE_MAX_AGE_SECONDS`); `verifyTelegramWidget` (Login Widget) держит отдельное окно 24 часа.
- **Client**: Хранит JWT в `localStorage`.

## Current Gaps
- Один `authProvider/providerId` не вмещает Google + Yandex + VK + Telegram + email одновременно.
- Совпадение email в OAuth не создает durable link.
- `email` и `telegramId` смешивают login lookup и contact/notification targets.
- Нет API для explicit link/unlink и audit trail.
- Нет безопасного admin merge (нельзя сливать аккаунты только по совпадению email).

## Target Contract For Phase 18

### Canonical Boundary
- `User` остается canonical business account.
- `UserIdentity` отвечает только за способы входа.
- JWT выдается на canonical `user.id`.

### Proposed Prisma Contract
```prisma
enum AuthIdentityProvider { EMAIL, TELEGRAM, GOOGLE, YANDEX, VK }

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
`providerSubject` — стабильный ID (normalized email, Telegram user id, OAuth sub/id). Metadata хранит только safe diagnostic fields, без токенов.

Требуется отдельный audit trail (`BACKFILLED`, `LINKED`, `UNLINKED`, `LOGIN_CONFLICT`, `MERGE_PREFLIGHT`) без хранения raw `providerSubject` или email в публичных ответах.

### Backfill Rules
- Явное создание `TELEGRAM` из `User.telegramId` и `EMAIL` из `User.email`.
- Bot-only юзеры получают `TELEGRAM` identity.
- Preflight проверяет дубликаты `lower(trim(email))`.
- Максимум одна активная identity каждого провайдера на `User`.
- Legacy поля остаются до полного переключения.

### Login Resolver Rules
- Поиск по `UserIdentity(provider, providerSubject)`.
- Если identity нет, но email из OAuth совпал с `User.email` — возвращать conflict, не делать silent link.
- Email collision возвращает safe message, а не raw error.
- Resolver обязан проверять `User.isBlocked`.

### Explicit Link / Unlink
- Link возможен только для авторизованного пользователя.
- OAuth link требует signed `state` (`action=link`) для защиты от cross-account привязки.
- Нельзя удалить последнюю usable identity.
- Unlink не удаляет contact channels (`User.email`/`User.telegramId`).

### Merge Boundary
- Автоматический merge в login flow **запрещен**.
- Admin/support merge возможен только после preflight-проверки affected assets.
- До утверждения per-relation policy merge работает только в режиме read-only preflight.

## Affected Surfaces (Must Stay Owned By `User.id`)
- `Order.userId`, `Transaction.userId`, `CloudPaymentsCardToken.userId`
- `ReferralLink.userId`, `PromoCode.referralOwnerId`, `PromoCodeRedemption.userId`
- `PushSubscription.userId`, `Notification.userId`
- Балансы и loyalty.

## Runtime Flows To Verify
- Email OTP, OAuth login/callback, Telegram Widget/WebApp, bot `/start`.
- OAuth link signed state / expired state.
- Unlink restrictions.
- Checkout, saved-card charge, balance top-up, referral/promo.

## Links
- [Phase 18: Account Identity Linking & Merge](../phases/phase-18-account-identity-linking-and-merge.md)
- [Payment Flow Audit](./payment-flow-audit.md)
- [Referral / Promo Runtime](./referrals-runtime.md)
