# Phase 3: Admin Auth & API Security Hardening

> [Корневой документ wiki](../README.md)

## Цель

Закрыть backend API как реальную границу доступа для admin operations. Устранить все CRITICAL и HIGH уязвимости, обнаруженные в security audit от 2026-05-08.

## Результат

- Все admin write endpoints защищены `JwtAdminGuard`.
- Все admin read endpoints (analytics, users list, payments, orders) защищены `JwtAdminGuard`.
- Публичные client-facing endpoints (каталог, страны, OAuth) остаются открытыми.
- Mixed admin/client endpoints (`orders/:id`, `orders/user/:userId`, `payments/user/:userId`, `users/:id`) не закрываются blind `JwtAdminGuard`: для user-facing доступа обязателен `JwtUserGuard` + ownership, для admin-facing доступа — `JwtAdminGuard`.
- Provider-facing debug/admin endpoints (`esim-provider/*`) закрыты `JwtAdminGuard`; прямой purchase у провайдера без order/payment boundary недоступен анонимно.
- Bot/internal endpoint `POST /users/find-or-create` закрыт service-token механизмом, совместимым с bot runtime, а не admin JWT.
- `POST /auth/register-admin` требует `SUPER_ADMIN` токен.
- JWT модель усилена: admin payload содержит `type: 'admin'`, guard проверяет whitelist ролей.
- Admin JWT TTL сокращён до 24 часов.
- Ручной парсинг JWT в `updateMyEmail` заменён на guard.
- Прямой неавторизованный вызов любого admin endpoint возвращает `401`.

## Оценка

~4-5 часов суммарно по всем шагам.
Высокий приоритет — без этого production API позволяет создавать admin-аккаунты, менять цены и читать PII без аутентификации.

## Зависит от

- [phase-2-runtime-verification.md](./phase-2-runtime-verification.md) — подтверждён рабочий контур
- [Security Audit от 2026-05-08](../../.agent/agents/security-auditor.md) — findings

## Пререквизиты

- Локально поднят backend и admin.
- `POST /api/auth/login` работает, возвращает admin JWT.
- `admin/lib/api.ts` уже отправляет `Bearer` из `localStorage`.
- `admin/app/page.tsx` уже имеет login form и сохраняет `access_token` в localStorage.
- `SharedAuthModule` глобально экспортирует `JwtAdminGuard` и `JwtUserGuard`.

## Архитектурные решения

- Admin login UI и token propagation уже реализованы ранее. Шаги 2-3 из предыдущей версии Phase 3 подтверждены как выполненные.
- Защита endpoints — атомарная операция только для чистых admin routes: добавляем `@UseGuards(JwtAdminGuard)` — admin UI уже отправляет Bearer.
- `GET /products`, `GET /products/countries`, `GET /products/:id` — остаются публичными (клиентский каталог).
- `POST /users/find-or-create` — используется ботом и legacy client helpers. Его нельзя закрывать `JwtAdminGuard`: вводится `ServiceTokenGuard` для bot (`x-telegram-bot-token`) и/или отдельный user-authenticated контракт для client.
- `GET /orders/:id`, `GET /orders/user/:userId`, `GET /payments/user/:userId`, `GET /users/:id` используются и из admin, и из client. Для них нужен split-by-ownership: admin видит любой ресурс, user — только свой.
- Для mixed endpoints предпочтителен `OrGuard([JwtAdminGuard, JwtUserGuard])` + явная ownership проверка. Если `OrGuard` усложняет DI/Swagger, допустимы отдельные routes: `/admin/*` под `JwtAdminGuard` и `/me/*` под `JwtUserGuard`.
- `POST /payments/create` под `JwtUserGuard` должен проверять, что `order.userId === currentUser.id`, иначе остаётся IDOR по `orderId`.
- `POST /orders/:id/fulfill-free` сейчас вызывается client при 100% promo. Либо переводим free-order fulfillment внутрь `POST /orders`, либо оставляем endpoint user-owned для `totalAmount === 0`; blind `JwtAdminGuard` ломает client flow.
- Обязательно: `type: 'admin'` в JWT payload + whitelist ролей в guard, чтобы user-токен не проходил admin guard.

## Шаги (журналы)

- [Шаг 1. Зафиксировать текущую auth-карту (обновлённый аудит)](./phase-3/step-1-auth.md)
- [Шаг 2. Подтвердить работоспособность admin login flow](./phase-3/step-2-admin-login-ui.md)
- [Шаг 3. Закрыть CRITICAL endpoints guard'ами](./phase-3/step-3-critical-guards.md)
- [Шаг 4. Закрыть HIGH endpoints guard'ами + исправить IDOR](./phase-3/step-4-high-guards-and-idor.md)
- [Шаг 5. Усилить JWT модель (type, roles, TTL)](./phase-3/step-5-jwt-hardening.md)
- [Шаг 6. Провести security smoke](./phase-3/step-6-security-smoke.md)

## Верификация

- `POST /api/auth/register-admin` без токена → `401`.
- `POST /api/auth/register-admin` с `SUPPORT` токеном → `403`.
- `GET /api/analytics/dashboard` без токена → `401`.
- `POST /api/system-settings/pricing` без токена → `401`.
- `GET /api/users` без токена → `401`.
- `GET /api/products` без токена → `200` (публичный каталог).
- `POST /api/products/sync` без токена → `401`.
- `POST /api/esim-provider/purchase` без токена → `401`.
- `GET /api/orders/<own-id>` с user JWT владельца → `200`; с user JWT другого пользователя → `403`.
- `POST /api/payments/create` с чужим `orderId` → `403`.
- Bot `/users/find-or-create` с `x-telegram-bot-token` → `200`; без token → `401`/`403`.
- Admin UI login → dashboard загружается → все вкладки работают.
- `npm run build` — без ошибок.
- `npm run test` — все тесты green.

## Журнал

- **[2026-05-07] Аудит текущего состояния:**
  - Шаг 1 выполнен (первичный аудит).
  - Admin UI использовал frontend-only PIN — обнаружено, что уже переведён на backend login flow.
  - `admin/lib/api.ts` уже отправляет `Bearer` из localStorage, `page.tsx` уже реализует login form.

- **[2026-05-08] Полный security audit:**
  - Проведён полный аудит по OWASP Top 10:2025 методологии.
  - Обнаружено 3 CRITICAL, 5 HIGH, 4 MEDIUM, 3 LOW уязвимостей.
  - Phase 3 переписана с учётом findings и обновлённого состояния кода.
  - Шаги 2-3 из предыдущей версии подтверждены как выполненные (login UI + token propagation уже работают).
  - Новая декомпозиция: 6 шагов с фокусом на guards, JWT hardening и smoke.

- **[2026-05-08] Review плана hardening:**
  - Уточнено, что Phase 3 не должна ломать client/bot runtime.
  - `EsimProviderController` добавлен в critical scope.
  - Mixed routes переведены на модель `admin OR owner`, а не blanket admin-only.

- **[2026-05-08] Реализация code layer Phase 3:**
  - Добавлены `ServiceTokenGuard` и `OrGuard`; bot-only routes `/users/find-or-create` и `/referrals/register` теперь ходят через `x-telegram-bot-token`.
  - Закрыты `analytics`, `system-settings`, `esim-provider`, mutating `products`, `payments/cloudpayments/test-notify`, `register-admin`, а mixed `users/orders/payments` routes переведены на `admin OR owner`.
  - `updateMyEmail` больше не парсит JWT вручную: route использует `JwtUserGuard` + `@CurrentUser()`.
  - Admin JWT теперь выпускается с `type: 'admin'`, role whitelist enforced в `JwtAdminGuard`, TTL сокращён до `24h`.
  - `client/lib/api.ts` переведён с legacy `POST /users/find-or-create` на `GET /auth/me` для чтения текущего пользователя из user JWT.
  - Добавлены unit specs для guards и controller contracts; `npm test -- --runInBand` прошёл, `npx nest build` прошёл.
  - `npm run build` упирается не в TypeScript, а в Windows file lock внутри `prisma generate` (`query_engine-windows.dll.node` rename); manual HTTP/UI smoke остаётся отдельным незавершённым шагом.

## Ссылки

- [Корневой документ wiki](../README.md)
- [Architecture module map](../architecture/module-map.md)
