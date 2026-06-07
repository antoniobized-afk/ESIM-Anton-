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
- Убрать silent OAuth attach по совпавшему email без авторизованной сессии.
- Перевести Telegram Widget/WebApp на `TELEGRAM` identity.
- Перевести bot `users/find-or-create` на общий Telegram identity path или
  совместимый adapter.
- Обновлять `lastLoginAt` у identity.
- Сохранить `/auth/me` response compatibility для клиента.

## Результат шага

- Все login flows выдают JWT на тот же canonical `User.id`.
- Новые provider identities создаются явно и повторяемо.
- Email collision и provider collision возвращают управляемые ошибки, а не
  создают hidden merge.

## Зависимости

- Шаг 2.

## Статус

`planned`

## Журнал изменений

### 2026-06-06

- Шаг запланирован как первое runtime-переключение после schema/backfill.

## Файлы

- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/oauth.service.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.controller.ts`
- `bot/src/api.ts`
- `bot/src/commands/index.ts`
- `client/components/AuthProvider.tsx`
- `client/app/login/page.tsx`
- `client/app/login/callback/page.tsx`

## Тестирование / Верификация

- Unit tests для email/OAuth/Telegram resolver.
- Controller tests для `/auth/me` и auth endpoints.
- Bot registration test/mocked smoke: `/start` не создает дубль.
- Manual smoke по email, Google/Yandex, Telegram Widget и Telegram WebApp.
