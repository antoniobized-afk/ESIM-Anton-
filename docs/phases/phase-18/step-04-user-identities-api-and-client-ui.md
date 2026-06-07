# Шаг 4. User-facing identities API и client UI

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Дать пользователю явный и понятный интерфейс управления способами входа без
смешивания login identities с балансом, заказами и notification channels.

## Что нужно сделать

- Добавить `GET /auth/identities/me` под `JwtUserGuard`.
- Добавить explicit link endpoints для OAuth/Telegram/email, если выбранный UX
  требует backend callback с авторизованной session.
- Добавить unlink endpoint с guard:
  - нельзя удалить последнюю usable identity;
  - нельзя удалить identity, принадлежащую другому `User`;
  - unlink не удаляет `User.email`/`User.telegramId` как contact channel без
    отдельного подтвержденного product decision.
- Добавить UI в client profile/settings:
  - список привязанных способов входа;
  - кнопки привязки доступных provider-ов;
  - понятные conflict states;
  - unlink action с confirm.
- Не добавлять admin-only merge controls в пользовательский UI.

## Результат шага

- Пользователь видит, чем может входить.
- Привязка нового provider-а происходит явно из авторизованной сессии.
- Unlink не ломает доступ к аккаунту и уведомления.

## Зависимости

- Шаг 3.

## Статус

`planned`

## Журнал изменений

### 2026-06-06

- Шаг запланирован после runtime migration login flows.

## Файлы

- `backend/src/modules/auth/auth.controller.ts`
- `backend/src/modules/auth/auth.service.ts`
- `client/app/profile/page.tsx`
- `client/lib/api.ts`
- `client/lib/auth.ts`

## Тестирование / Верификация

- User с одной identity не может удалить последнюю identity.
- User с двумя identities может удалить одну и войти оставшейся.
- Link provider conflict не меняет текущий `User`.
- Client type-check проходит.
