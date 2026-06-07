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
- `backend/src/modules/auth/oauth.service.ts`
- `backend/src/common/auth/jwt-user.guard.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.controller.ts`
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
  @@index([userId])
}
```

`providerSubject` — это стабильный provider id:

- `EMAIL`: normalized email;
- `TELEGRAM`: Telegram user id;
- `GOOGLE`: Google `sub`;
- `YANDEX`: Yandex `id`;
- `VK`: VK `id`.

### Backfill Rules

Backfill должен быть явным и проверяемым:

- из `User.telegramId` создать `TELEGRAM` identity;
- из `User.authProvider/providerId` создать соответствующую identity;
- из `User.email` создать или подготовить `EMAIL` identity без потери текущего
  email-login поведения;
- все конфликты уникальности должны попадать в preflight report, а не
  резолвиться автоматическим merge-ом;
- legacy поля остаются до полного переключения login flows и отдельного
  deprecation step.

### Login Resolver Rules

- Сначала искать `UserIdentity(provider, providerSubject)`.
- Если identity найдена, выдать JWT на `identity.userId` и обновить
  `lastLoginAt`.
- Если identity не найдена и provider payload не конфликтует, создать нового
  `User` и `UserIdentity`.
- Если OAuth profile email совпал с существующим `User.email`, но
  `(provider, providerSubject)` не привязан, не делать silent link. User должен
  войти существующим способом и явно привязать provider.
- Email OTP после успешного кода может создать/подтвердить `EMAIL` identity для
  текущего unique email, сохранив текущую user-facing модель входа по email.
- Telegram bot find-or-create должен использовать тот же identity resolver или
  совместимый adapter, но не обходить target identity contract.

### Explicit Link / Unlink

- Link нового provider-а — только действие уже авторизованного пользователя.
- Если `(provider, providerSubject)` уже принадлежит другому `User`, возвращать
  conflict и вести пользователя/support в merge flow.
- Нельзя удалить последний usable login identity.
- Unlink login identity не должен молча удалять contact channel:
  `User.email` и `User.telegramId` сейчас используются для уведомлений и требуют
  отдельной product policy перед удалением.

### Merge Boundary

Автоматический merge запрещен в login flow.

Admin/support merge может появиться только после отдельного preflight:

- source user и target user;
- список affected assets: orders, eSIM, transactions, balances, saved cards,
  referral ownership, promo ownership, push subscriptions, notifications;
- конфликтные provider identities;
- финансовый ledger и partner reward history;
- audit log с оператором, причиной, timestamps и before/after snapshot.

До фиксации per-surface merge policy mutation merge должен быть read-only
diagnostic/preflight, а не перенос данных.

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
npx jest src/modules/auth/ --runInBand
npx jest src/modules/users/ --runInBand
npx jest src/modules/referrals/ --runInBand
npx jest src/modules/orders/orders.service.spec.ts --runInBand
npx jest src/modules/payments/payments.service.spec.ts --runInBand
npx tsc --noEmit -p tsconfig.json
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
- authorized user links a new provider and can login with both methods;
- unlink refuses to remove the last login identity;
- referral attribution and partner rewards remain attached to canonical `User.id`;
- saved-card charge still uses `AccountId == user.id`.

## Links

- [Phase 18: Account Identity Linking & Merge](../phases/phase-18-account-identity-linking-and-merge.md)
- [Payment Flow Audit](./payment-flow-audit.md)
- [Referral Runtime](./referrals-runtime.md)
- [Promo Codes Runtime](./promo-codes-runtime.md)
- [Gotchas](./gotchas.md)
