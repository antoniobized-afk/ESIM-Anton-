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
Этот контракт описывает только один текущий provider slot. `phone` в `User` является contact-полем, live phone-login потока нет.

### User JWT
`JwtUserGuard` принимает токен: `{ sub: user.id, type: 'user', provider: user.authProvider }`.
`sub` — это canonical boundary. `provider` — лишь legacy hint.

### Login Flows
- **Email OTP**: `POST /auth/email/verify` ищет/создает `User` по `email`.
- **OAuth (Google/Yandex/VK)**: Ищет по `(authProvider, providerId)`, затем по `telegramId` (для Telegram), затем по `email`. Если email совпал, логинит, но durable link не создает, если провайдер другой.
- **Telegram (Bot)**: `POST /users/find-or-create` ищет по `telegramId`.
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