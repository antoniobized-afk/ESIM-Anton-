# Шаг 3. Identity resolver и login flow migration

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Перевести email, OAuth, Telegram Widget, Telegram WebApp и bot registration на
единый resolver `UserIdentity -> User`, сохранив JWT subject как `User.id`.

## Что нужно сделать

- Вынести identity lookup/create/link logic в отдельный backend service.
- Перевести `AuthService.loginWithEmail()` на `EMAIL` identity.
- Перевести `AuthService.loginWithOAuth()` на lookup по
  `(provider, providerSubject)`.
- Убрать silent OAuth attach/login по совпавшему email без авторизованной
  link-session. Email collision должен возвращать structured conflict code.
- Перевести Telegram Widget/WebApp на `TELEGRAM` identity.
- Перевести bot `users/find-or-create` на общий Telegram identity path или
  совместимый adapter.
- Обновлять `lastLoginAt` у identity.
- Проверять canonical `User.isBlocked` policy перед выдачей JWT или явно
  зафиксировать сохранение текущего behavior как security follow-up.
- Сохранить JWT subject: `sub=user.id`. `provider` в payload остается legacy
  hint/last-login metadata и не становится authorization key.
- Не менять `User.email`/`User.telegramId` как contact/notification fields при
  простом login.
- Сохранить `/auth/me` response compatibility для клиента.

## Результат шага

- Все login flows выдают JWT на тот же canonical `User.id`.
- Новые provider identities создаются явно и повторяемо.
- Email collision и provider collision возвращают управляемые ошибки, а не
  создают hidden merge.
- Bot `/start` и Telegram Mini App cold start сходятся на одном `User.id`.
- OAuth login callback и future link callback имеют разные contracts: login не
  attach-ит provider, link требует signed state.

## Зависимости

- Шаг 2.

## Статус

`implemented-local, pending DB migration/backfill and runtime smoke`

## Журнал изменений

### 2026-06-06

- Шаг запланирован как первое runtime-переключение после schema/backfill.

### 2026-06-07

- Добавлен SRP-контур `backend/src/modules/auth/identity-resolver/*`:
  - `OAuthIdentityProfileMapper` нормализует OAuth/Telegram provider payload в
    `AuthIdentityInput`;
  - `AuthIdentityAuditService` пишет audit `LINKED` с hash/masked provider
    subject;
  - `AuthIdentityResolverService` владеет lookup/create identity и блокирует
    silent merge/link.
- `AuthService.loginWithEmail()` переведен на `EMAIL` identity resolver.
  Email OTP может создать `EMAIL` identity для существующего `User.email`,
  потому что владение email уже подтверждено кодом.
- Legacy `users.email` fallback ищется normalized/case-insensitive: один match
  сохраняет canonical `User.id`, несколько normalized matches возвращают
  controlled `EMAIL_NORMALIZED_DUPLICATE` conflict и не выбирают случайный
  аккаунт.
- Email OTP login endpoints используют DTO для send/verify payloads.
- `AuthService.loginWithOAuth()` переведен на lookup по
  `UserIdentity(provider, providerSubject)`.
- OAuth с unknown provider subject и email, уже занятым другим `User`, теперь
  возвращает structured `OAUTH_EMAIL_ALREADY_USED` conflict и не создает
  identity.
- Обычный OAuth login callback нормализует `state` в safe relative `returnTo`;
  external/protocol-relative/backslash/malformed значения не попадают в
  `/login/callback`.
- OAuth/email/provider conflicts теперь пишут `LOGIN_CONFLICT` audit с
  hash/masked provider subject и safe metadata. Публичный conflict response не
  раскрывает owner `User.id`.
- Concurrent identity create race и попытка завести второй active provider для
  одного canonical `User` возвращают controlled conflict и оставляют audit
  `LOGIN_CONFLICT`.
- Telegram Widget/WebApp при отсутствии identity использует безопасную
  continuity-ветку по verified Telegram id (`User.telegramId`) и создает
  `TELEGRAM` identity для того же canonical `User.id`.
- Telegram Widget/WebApp при наличии identity блокирует split-brain drift:
  нельзя выдать login result, если verified Telegram subject конфликтует с
  `users.telegramId` другого `User` или с contact field своего identity owner.
- Bot-only `UsersService.findOrCreate()` переведен на
  `AuthIdentityResolverService.resolveTelegramBotUser()`.
- Bot `users/find-or-create` использует DTO с numeric `telegramId`, чтобы
  invalid payload не доходил до `BigInt(telegramId)` в controller runtime.
- Resolver обновляет `UserIdentity.lastLoginAt` и проверяет `User.isBlocked`
  перед выдачей login result.
- JWT subject не изменился: `sub=user.id`; `provider` остается last-login hint.
- Legacy fields не удалялись. Для новых пользователей resolver еще заполняет
  первый legacy slot как transitional compatibility field, но не перезаписывает
  existing `User.authProvider/providerId` при простом login.
- OAuth signed `action=link` state и user-facing link/unlink API еще не
  реализованы. Это остается задачей следующих шагов.

## Файлы

- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/oauth.service.ts`
- `backend/src/modules/auth/identity/auth-identity-normalizer.ts`
- `backend/src/modules/auth/identity/auth-identity-privacy.ts`
- `backend/src/modules/auth/identity-resolver/auth-identity-resolver.types.ts`
- `backend/src/modules/auth/identity-resolver/oauth-identity-profile.mapper.ts`
- `backend/src/modules/auth/identity-resolver/auth-identity-audit.service.ts`
- `backend/src/modules/auth/identity-resolver/auth-identity-resolver.service.ts`
- `backend/src/modules/auth/identity-resolver/auth-identity-resolver.service.spec.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.controller.ts`
- `backend/src/modules/users/users.module.ts`
- `bot/src/api.ts`
- `bot/src/commands/index.ts`
- `client/components/AuthProvider.tsx`
- `client/app/login/page.tsx`
- `client/app/login/callback/page.tsx`

## Тестирование / Верификация

- `npx jest modules/auth/identity-resolver/auth-identity-resolver.service.spec.ts modules/auth/identity-backfill/user-identity-backfill.service.spec.ts modules/auth/auth.controller.spec.ts modules/users/users.controller.spec.ts --runInBand`
  — passed, 27 tests.
- `npx jest modules/auth/ --runInBand` — passed, 21 tests.
- `npx jest modules/users/ --runInBand` — passed, 6 tests.
- `npx tsc --noEmit -p tsconfig.json` — passed.
- Tests покрывают email identity creation, normalized legacy email continuity,
  duplicate normalized legacy email conflict, OAuth email collision without
  silent attach, `LOGIN_CONFLICT` audit без raw provider subject/email,
  Telegram bot-only continuity, Telegram identity/contact split-brain,
  DTO validation для email/Telegram/bot payloads, OAuth returnTo normalization,
  blocked user policy и bot identity idempotency.
- Manual smoke по email, Google/Yandex, Telegram Widget и Telegram WebApp.
