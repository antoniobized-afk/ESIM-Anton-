# Local User Auth Switching

> [Корневой документ wiki](../README.md)

Runbook для локального входа под уже существующим пользователем после клонирования production-like базы.

## Зачем нужен этот документ

В проекте нет user-password auth. Пользовательский вход сделан через:

- email OTP
- OAuth Google/Yandex/VK на backend
- Telegram Login Widget / Telegram WebApp

Это значит, что "зайти под пользователем" локально обычно означает:

1. выбрать существующего пользователя в таблице `users`;
2. привязать к нему удобный локальный login method;
3. войти через обычный frontend flow.

Source of truth по логике:

- [backend/src/modules/auth/auth.service.ts](../../backend/src/modules/auth/auth.service.ts)
- [backend/src/modules/auth/email-code.service.ts](../../backend/src/modules/auth/email-code.service.ts)
- [backend/src/modules/auth/identity-resolver/auth-identity-resolver.service.ts](../../backend/src/modules/auth/identity-resolver/auth-identity-resolver.service.ts)
- [backend/src/modules/auth/identity-management/auth-identity-management.service.ts](../../backend/src/modules/auth/identity-management/auth-identity-management.service.ts)
- [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma)

## Важная модель авторизации

### Email login

После Phase 18 `AuthService.loginWithEmail()` идет через
`AuthIdentityResolverService`:

- сначала ищет `UserIdentity(EMAIL, normalizedEmail)`;
- затем сохраняет legacy continuity через `users.email`, если identity еще не
  создана;
- если пользователя с таким email нет, backend создаст нового `User` и
  `EMAIL` identity.

Следствие:

- для входа под существующим пользователем нужно сначала записать ему локальный
  `UserIdentity(EMAIL, normalizedEmail)`;
- `users.email` остается contact/runtime field и legacy continuity fallback;
- `authProvider='email'` и `providerId=email` можно обновлять только как
  transitional compatibility hint, но это больше не canonical способ входа;
- у одного пользователя может быть только одна active identity каждого provider:
  unique `(userId, provider)`.

### OAuth / Telegram

`loginWithOAuth()` после Phase 18 матчится по одному из источников:

- `UserIdentity(provider, providerSubject)`;
- exact legacy `authProvider + providerId` continuity;
- `telegramId` для Telegram bot-only continuity;
- обычный OAuth login проверяет email collision через `users.email` и
  `UserIdentity(EMAIL)`, но не делает silent OAuth link;
- explicit OAuth link из авторизованной сессии проверяет provider subject, а не
  блокирует Google/Yandex только из-за совпавшего contact email другого legacy
  аккаунта. Такой link не переносит заказы, баланс, saved cards или email
  contact field.

Следствие:

- для принудительного локального входа email OTP обычно проще и безопаснее;
- менять Telegram/OAuth идентификаторы стоит только если вы понимаете, какие связи хотите сохранить.

## Предпосылки

- локальная БД уже импортирована из Railway или подготовлена другим способом;
- локальный PostgreSQL живёт в Docker-контейнере `esim-postgres`;
- DB credentials по `docker-compose.yml`:
  - DB: `esim_db`
  - User: `postgres`
  - Password: `postgres`

## Сценарий 1. Войти под существующим пользователем через email

### Шаг 1. Найти пользователя

Примеры:

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "select id, \"firstName\", \"lastName\", username, email, \"authProvider\" from users where username = 'Dmitry_ManWorld';"
```

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "select id, \"firstName\", \"lastName\", username, email, \"authProvider\" from users where \"firstName\" ilike '%Дмитрий%' or \"lastName\" ilike '%Свистунов%';"
```

### Шаг 2. Привязать тестовый email

Пример email: `local-test@example.com`

После применения Phase 18 migration предпочтительно привязать локальный email
через обычный authenticated link flow в UI. Если нужен emergency local access в
клонированной dev DB, можно подготовить identity напрямую. Это не production
процедура и не замена audit trail.

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "insert into user_identities (id, \"userId\", provider, \"providerSubject\", email, \"emailVerified\", \"linkedAt\", metadata) values ('local_email_' || md5('USER_ID_HERE:local-test@example.com'), 'USER_ID_HERE', 'EMAIL', 'local-test@example.com', 'local-test@example.com', true, now(), '{\"source\":\"local-user-auth-switch\"}'::jsonb) on conflict (\"userId\", provider) do update set \"providerSubject\" = excluded.\"providerSubject\", email = excluded.email, \"emailVerified\" = true, metadata = excluded.metadata;"
```

Если таблицы `user_identities` еще нет, значит Phase 18 migration не применена
в этой локальной БД. Для старого runtime остается legacy-only fallback:

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "update users set email = 'local-test@example.com', \"authProvider\" = 'email', \"providerId\" = 'local-test@example.com' where id = 'USER_ID_HERE';"
```

Если email уже занят другим пользователем или `UserIdentity(EMAIL,
local-test@example.com)` уже принадлежит другому `User`, сначала выберите
другой локальный email. Не переносите чужой email между пользователями
вслепую.

### Шаг 3. Удалить случайно созданного email-user, если уже успели войти не в ту запись

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "delete from users where email = 'local-test@example.com' and \"authProvider\" = 'email' and id <> 'USER_ID_HERE';"
```

Делайте это только если уверены, что удаляете новый тестовый аккаунт, а не нужного пользователя.

### Шаг 4. Запросить email OTP-код через клиент

Обычный flow:

1. открыть `http://localhost:3002/login`;
2. выбрать вход по email;
3. ввести тестовый email;
4. запросить код.

### Шаг 5. Прочитать код из таблицы `email_codes`

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "select email, code, \"expiresAt\", attempts from email_codes order by \"createdAt\" desc limit 5;"
```

Если SMTP локально не настроен, backend логирует dev code и всё равно создает
запись в `email_codes`, и этого достаточно для входа.

## Сценарий 2. Переключить пользователя обратно на Telegram

Если хотите вернуть ему telegram-first логин после тестов:

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "update users set \"authProvider\" = 'telegram' where id = 'USER_ID_HERE';"
```

Email при этом можно оставить как contact field или убрать отдельно, если это
точно тестовая правка:

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "update users set email = null where id = 'USER_ID_HERE';"
```

## Сценарий 3. Переключить пользователя на OAuth идентификатор

Это уже рискованнее, потому что можно задеть реальные provider bindings.

Пример:

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "update users set email = 'local-test@example.com', \"authProvider\" = 'google', \"providerId\" = 'local-google-test' where id = 'USER_ID_HERE';"
```

Использовать только если тест реально требует OAuth-пути.

## Проверка результата

```bash
docker exec -e PGPASSWORD=postgres -i esim-postgres \
  psql -U postgres -d esim_db \
  -c "select id, phone, email, username, \"firstName\", \"lastName\", \"authProvider\", \"providerId\", \"telegramId\" from users where id = 'USER_ID_HERE'; select id, provider, \"providerSubject\", email, \"emailVerified\" from user_identities where \"userId\" = 'USER_ID_HERE' order by provider;"
```

## Чего не делать

- не искать user password: его нет в схеме;
- не менять `id` пользователя;
- не запускать `seed` после импорта production-like базы;
- не менять provider binding вслепую на реальном production;
- не использовать старые phone/SMS инструкции: live user login сейчас идет через
  email OTP, OAuth и Telegram.
