# Phase 8: API Security Infrastructure (Helmet, CORS, DTO, Rate Limiting)

> [Корневой документ wiki](../README.md)

## Цель

Устранить MEDIUM и LOW уязвимости из security audit 2026-05-08: добавить security headers, ограничить CORS, скрыть Swagger в production, создать DTO с валидацией, внедрить rate limiting.

## Результат

- Backend отдаёт baseline security headers через `helmet`, не ломая payment success/fail HTML и Telegram/CloudPayments related scripts.
- CORS настроен с явным списком разрешённых origins, без fallback на `*`.
- CORS origins покрывают admin, client/PWA/Mini App и локальные dev origins; список синхронизирован с `.env.example`.
- Swagger UI недоступен в production (`NODE_ENV=production`).
- `test-notify` endpoint подтверждён как admin-only surface под `JwtAdminGuard`.
- Все external write endpoints используют типизированные DTO с `class-validator` вместо `@Body() dto: any` или невалидируемых inline body contracts.
- Provider webhooks и raw callbacks не ломаются: там primary control остаётся на signature/HMAC/provider parser, а не на strict DTO.
- Auth endpoints защищены rate limiting (5 login / 3 SMS в минуту), а webhooks явно исключены из throttling.
- Rate limiting учитывает reverse proxy/Railway deployment и не рассматривается как полноценный distributed control без явного storage strategy.

## Оценка

~4-6 часов суммарно с ручной верификацией по `admin/client/bot`.
Риск регрессий средний и местами высокий: `helmet` и Swagger почти безопасны, но DTO/CORS/throttle меняют реальные integration contracts и HTTP semantics.

## Зависит от

- [phase-3-admin-auth-and-api-security.md](./phase-3-admin-auth-and-api-security.md) — guards и JWT hardening должны быть выполнены первыми.

## Пререквизиты

- Phase 3 полностью выполнена (guards + JWT hardening).
- Локально поднят backend.
- `npm run build` и `npm run test` проходят.
- Известны production CORS origins из `.env.example`.
- Подтверждены реальные frontend callers: `admin`, `client/PWA`, Telegram Mini App, Telegram bot.
- Понятна текущая Railway topology: один backend instance или возможен horizontal scaling.

## Архитектурные решения

- Phase 8 нельзя выкатывать как один большой "security cleanup". Её нужно внедрять волнами: `helmet/CORS` -> `Swagger/test-notify verification` -> `DTO` -> `throttle`.
- `helmet` используется как baseline security headers control. CSP нельзя включать вслепую: `payments/success` и `payments/fail` содержат inline styles/scripts и внешние Telegram/CloudPayments scripts, поэтому CSP нужно либо настроить явно, либо временно отключить до отдельного CSP hardening.
- CORS: `process.env.CORS_ORIGIN` должен содержать comma-separated список доменов. Fallback на localhost-only, а не на `*`.
- Swagger: полностью скрыт в production. Если нужен доступ — рассмотреть Basic Auth в следующей итерации.
- DTO: используем `class-validator` + `class-transformer`. Глобальный `ValidationPipe` с `whitelist: true` и `forbidNonWhitelisted: true` уже настроен, но с `any` и inline body contracts whitelist не работает.
- DTO-слой рассматривается как изменение API contract, а не как косметический refactor. Перед каждой группой DTO нужно подтвердить фактический payload соседних клиентов и после замены прогнать ручной smoke.
- Для bot/internal endpoints DTO обязательны так же, как и для browser callers, но auth boundary остаётся у `ServiceTokenGuard`; DTO не заменяют service-token.
- Webhooks CloudPayments/Robokassa не должны попадать под strict DTO, если это ломает raw-body verification, провайдерный парсинг или callback compatibility.
- Rate limiting: `@nestjs/throttler` глобально с мягким лимитом (60 req/min), жёсткие лимиты на auth endpoints. Для production при горизонтальном scaling нужен Redis-backed store или явно зафиксированное single-instance ограничение.
- Proxy/IP: нужно зафиксировать trusted proxy behavior, иначе лимиты могут считаться по Railway proxy IP или обходиться через headers.
- Webhooks: `@SkipThrottle()` — внешние платёжные системы не должны throttle-иться.

## Порядок реализации

### Wave 1. Низкорисковая инфраструктура

- `helmet` без blind CSP.
- explicit CORS parser вместо `*`.
- Swagger only outside production.
- verification, что `test-notify` уже закрыт после Phase 3 и не требует повторной бизнес-логики.

### Wave 2. Contract hardening

- DTO для auth, products, system-settings, users, orders, payments, referrals и других external write routes.
- Сначала auth/products/system-settings, затем user/order/payment surfaces, затем bot/internal payloads.
- После каждой подгруппы нужен smoke не только backend tests, но и реальных payload-ов из `admin/client/bot`.

### Wave 3. Abuse controls

- Global throttle.
- Hard throttle на `login` и `send-code`.
- Явные exclusions для webhook surfaces.
- Проверка proxy/topology assumptions для Railway.

## Ожидаемые зоны регрессии

- `CORS_ORIGIN`: неполный список доменов или stray whitespace ломают browser flows только после deploy.
- `helmet`: слишком агрессивный CSP или frame policy могут сломать payment success/fail pages и Telegram-related embeds.
- DTO: существующие клиенты могут слать числа строками, лишние поля, `null` вместо `undefined`, устаревшие property names и частичные payload-ы.
- `orders` и `payments`: после DTO ошибки будут приходить как `400`, а не как поздние service-level exceptions.
- `find-or-create` и `referrals/register`: bot/internal payloads особенно хрупкие, потому что у них меньше UI smoke и больше implicit assumptions.
- `throttling`: при неверной IP extraction пользователи могут получать ложные `429`, а webhooks — неожиданные retries/failures.

## Шаги (журналы)

- [Шаг 1. Security headers и CORS](./phase-8/step-1-helmet-cors.md)
- [Шаг 2. Swagger и test-notify](./phase-8/step-2-swagger-test-notify.md)
- [Шаг 3. DTO с class-validator для external write endpoints](./phase-8/step-3-dto-validation.md)
- [Шаг 4. Rate limiting](./phase-8/step-4-rate-limiting.md)

## Верификация

- `curl -I http://localhost:3000/api/products` → заголовки `X-Content-Type-Options`, `X-Frame-Options` присутствуют.
- `NODE_ENV=production` → `GET /api/docs` → `404`.
- `POST /api/auth/register-admin` с `@Body() { email: 123 }` → `400` с описанием ошибки валидации.
- `POST /api/products/bulk/toggle-active` с неизвестными полями → `400`.
- `POST /api/payments/create` без `orderId` → `400`.
- `POST /api/orders` без `productId` → `400`.
- 6 x `POST /api/auth/login` за минуту → `429 Too Many Requests`.
- 4 x `POST /api/auth/phone/send-code` за минуту → `429 Too Many Requests`.
- Webhook `POST /api/payments/cloudpayments/pay` → не throttle-ится.
- Robokassa webhook `POST /api/payments/webhook` → не throttle-ится.
- `npm run build` — без ошибок.
- `npm run test` — все тесты green.
- Manual smoke:
  - admin login и основные mutation screens не получают новых `400`/CORS failures;
  - client cold start, `/orders`, `/balance`, checkout paths не ломаются;
  - bot `find-or-create` и `referrals/register` продолжают работать на service-token contract;
  - `payments/success` и `payments/fail` открываются без CSP/runtime breakage.

## Журнал

- **[2026-05-08]** Фаза создана по результатам security audit. Покрывает MEDIUM (4 находки) и LOW (3 находки) из аудита.
- **[2026-05-08]** После review плана scope расширен: DTO теперь покрывают все external write inputs, CORS учитывает client/admin origins, throttling учитывает proxy/distributed risks, Helmet CSP не включается вслепую для payment callback HTML.
- **[2026-05-08]** После завершения основных Phase 3 changes фаза детализирована под реальный runtime: low-risk infrastructure выделена отдельно, DTO описаны как contract-hardening с обязательным smoke для `admin/client/bot`, throttling зафиксирован как defense-in-depth с явными operational assumptions для Railway/proxy topology.

## Ссылки

- [Корневой документ wiki](../README.md)
- [Phase 3: Admin Auth & API Security](./phase-3-admin-auth-and-api-security.md)
- Security Audit Report 2026-05-08 — исторический источник фазы; отдельный файл аудита в текущем дереве отсутствует.
