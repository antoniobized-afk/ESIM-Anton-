# Шаг 4. User-facing identities API и client UI

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Дать пользователю явный и понятный интерфейс управления способами входа без
смешивания login identities с балансом, заказами и notification channels.

## Что нужно сделать

- Добавить `GET /auth/identities/me` под `JwtUserGuard`.
- Добавить explicit link endpoints для OAuth/Telegram/email, если выбранный UX
  требует backend callback с авторизованной session.
- OAuth link endpoints должны создавать signed short-lived state/nonce,
  привязанный к текущему `User.id` и `action=link`; callback без такого state
  возвращает conflict/unauthorized и не attach-ит provider.
- Добавить unlink endpoint с guard:
  - нельзя удалить последнюю usable identity;
  - нельзя удалить identity, принадлежащую другому `User`;
  - unlink не удаляет `User.email`/`User.telegramId` как contact channel без
    отдельного подтвержденного product decision.
- Link/unlink writes должны создавать audit event. Если unlink физически
  удаляет `UserIdentity`, audit event обязан хранить masked/snapshot данные
  удаленной identity.
- Добавить UI в client profile/settings:
  - список привязанных способов входа;
  - кнопки привязки доступных provider-ов;
  - понятные conflict states;
  - unlink action с confirm.
- User-facing provider list должен соответствовать текущему продукту:
  email, Telegram, Google и Yandex. VK не показывать автоматически только
  потому, что backend route существует.
- После link/unlink client должен перечитать `/auth/me` и identities API, а не
  доверять старому `localStorage` snapshot.
- Не добавлять admin-only merge controls в пользовательский UI.

## Результат шага

- Пользователь видит, чем может входить.
- Привязка нового provider-а происходит явно из авторизованной сессии.
- Unlink не ломает доступ к аккаунту и уведомления.
- Conflict copy отделяет "этот способ входа уже привязан" от "email/contact
  уже занят другим аккаунтом".

## Зависимости

- Шаг 3.

## Статус

`implemented-local, pending browser/runtime smoke`

## Журнал изменений

### 2026-06-06

- Шаг запланирован после runtime migration login flows.

### 2026-06-07

- Добавлен backend management boundary
  `backend/src/modules/auth/identity-management/*`:
  - `GET /auth/identities/me`;
  - `POST /auth/identities/link/oauth/:provider/start`;
  - `POST /auth/identities/link/email/send-code`;
  - `POST /auth/identities/link/email/verify`;
  - `POST /auth/identities/link/telegram`;
  - `POST /auth/identities/link/telegram/webapp`;
  - `DELETE /auth/identities/:id`.
- OAuth link использует signed short-lived state с `action=link`, `provider`,
  `userId`, `returnTo`, `nonce`, `exp`. Callback со state формы link, но
  невалидной подписью/TTL, не падает в обычный login flow.
- OAuth callback сначала пытается обработать link-state; обычный login flow
  остается fallback только для обычного login state.
- Telegram WebApp auth/link payloads используют DTO validation; Telegram Widget
  остается dynamic payload exception для подписи.
- User-facing provider list ограничен `EMAIL`, `TELEGRAM`, `GOOGLE`, `YANDEX`.
  `VK` не показывается в клиентском UI.
- OAuth link provider allowlist вынесен в общий typed contract
  `OAUTH_IDENTITY_LINK_PROVIDERS`; `AuthController` отклоняет provider вне
  `google/yandex` до построения callback URL и до вызова management service.
- Unlink физически удаляет `UserIdentity` только после audit `UNLINKED`, не
  удаляет `User.email`/`User.telegramId` и запрещает удалить последний способ
  входа.
- Audit `LINKED/UNLINKED` snapshots не хранят raw email или raw
  `providerSubject`; email фиксируется как `emailHash/emailPreview`.
- Explicit email/OAuth/Telegram link conflicts пишут `LOGIN_CONFLICT` audit
  вне rollback-transaction: support видит attempted/conflicting user context,
  но публичный response не раскрывает чужой `User.id`, raw provider subject или
  полный email.
- Explicit Telegram link не меняет `User.telegramId`, но запрещает привязку,
  если verified Telegram subject уже является Telegram contact другого
  пользователя.
- User-facing identity transport вынесен из общего `AuthController` в
  `AuthIdentityController`; `AuthController` остается за login/callback
  маршруты, а общий расчет OAuth callback/frontend URL живет в
  `AuthCallbackUrlService`.
- В `client/app/profile/page.tsx` добавлен раздел "Способы входа": список
  identities, email link через код, OAuth link Google/Yandex, Telegram link из
  Mini App, unlink с confirm и refresh `/auth/me` + identities после mutation.
- Admin/support merge controls в пользовательский UI не добавлялись.

## Файлы

- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/auth-identity.controller.ts`
- `backend/src/modules/auth/auth-callback-url.service.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/auth/identity-management/auth-identity-management.types.ts`
- `backend/src/modules/auth/identity-management/auth-identity-link-state.service.ts`
- `backend/src/modules/auth/identity-management/auth-identity-management.service.ts`
- `backend/src/modules/auth/identity-management/auth-identity-management.service.spec.ts`
- `backend/src/modules/auth/auth-identity.controller.spec.ts`
- `backend/src/modules/auth/auth-callback-url.service.spec.ts`
- `client/app/profile/page.tsx`
- `client/lib/api.ts`
- `client/lib/auth.ts`

## Тестирование / Верификация

- `npx jest modules/auth/ --runInBand` — passed, 70 tests.
- `npx tsc --noEmit -p tsconfig.json` в backend — passed.
- `npx tsc --noEmit` в client — passed.
- Tests покрывают: user-facing providers без VK, запрет unlink последней
  identity, audit перед unlink, signed OAuth link start, invalid signed-like
  link state без fallback в login flow, explicit OAuth link provider allowlist,
  explicit link `LOGIN_CONFLICT` audit, отсутствие raw email/provider subject в
  `LINKED/UNLINKED` snapshots и Telegram identity/contact split-brain conflict.
- Browser/manual smoke еще не запускался: нужно проверить profile identities UI
  после применения миграции/backfill на dev DB.
