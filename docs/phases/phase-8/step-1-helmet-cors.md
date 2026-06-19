# Шаг 1. Security headers и CORS

> [⬅️ Назад к фазе](../phase-8-api-security-infrastructure.md)

## Цель

Добавить стандартные security headers через `helmet` и ограничить CORS явным списком origins.

Это low-risk шаг фазы, но только если не включать CSP вслепую и не ломать существующие payment/browser flows.

## Что нужно сделать

### 1.1 Установить и подключить helmet

- Выполнить `cd backend && npm install helmet`.
- В `backend/src/main.ts`:
  - Добавить `import helmet from 'helmet';` в начало файла.
  - Вызвать `app.use(helmet(...))` сразу после `NestFactory.create()`, до `setGlobalPrefix`.
  - Не включать CSP вслепую: `payments/success` и `payments/fail` отдают inline HTML/CSS/JS и подключают Telegram script. До отдельного CSP hardening использовать `contentSecurityPolicy: false` или явно разрешить нужные источники.
  - Не менять policy `crossOriginEmbedderPolicy`/`crossOriginOpenerPolicy` без подтверждения, что это не затрагивает текущие browser integrations.

```
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.setGlobalPrefix('api');
  // ...
}
```

### 1.2 Ограничить CORS

- В `backend/src/main.ts`:
  - Заменить `origin: process.env.CORS_ORIGIN || '*'` на parser для comma-separated origins.
  - Trim для каждого origin обязателен, пустые элементы удалить.
  - Fallback только localhost origins для admin и client.
  - Не смешивать browser origins и server-to-server callers: bot, CloudPayments и другие backend callers не зависят от CORS.
  - Если в runtime используются несколько browser domains (`admin`, `mojomobile.ru`, `app.mojomobile.ru`, Telegram Mini App host pages), все они должны попасть в allowlist до deploy.

```
До:
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

После:
  const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0
      ? corsOrigins
      : ['http://localhost:3001', 'http://localhost:3002'],
    credentials: true,
  });
```

### 1.3 Обновить `.env.example`

- Добавить или обновить переменную `CORS_ORIGIN` с комментарием:

```
# Comma-separated list of allowed browser origins for admin and client/PWA
CORS_ORIGIN=http://localhost:3001,http://localhost:3002,https://admin.mojomobile.ru,https://mojomobile.ru,https://app.mojomobile.ru
```

- Не добавлять `*` как fallback или как production value.
- Если Railway/Рег.ру фактические domains отличаются, перед deploy обновить `.env.example` и Railway env синхронно.
- Проверить, что bot/server-to-server calls не зависят от CORS: CORS защищает только browser requests, не является backend auth boundary.

### 1.4 До- и послешаговая проверка browser contracts

- До внедрения снять фактический список browser origins из кода и deployment docs:
  - `admin` local/prod;
  - `client/PWA` local/prod;
  - любые host pages, с которых запускается Telegram Mini App.
- После внедрения проверить не только `curl`, но и реальный browser:
  - admin login;
  - public catalog;
  - authenticated client page (`/orders` или `/balance`);
  - `payments/success` и `payments/fail`.

## Результат шага

- Backend отдаёт security headers на каждый ответ.
- CORS ограничен явным списком доменов.
- Payment callback HTML не ломается из-за CSP.
- Browser clients продолжают работать без CORS errors в console/network.

## Статус

Не начато

## Журнал изменений

(будет заполнено при реализации)

## Файлы

- `backend/src/main.ts`
- `backend/package.json` (новая зависимость `helmet`)
- `.env.example`

## Тестирование / Верификация

- `curl -I http://localhost:3000/api/products` → проверить заголовки:
  - `X-Content-Type-Options: nosniff` ✓
  - `X-Frame-Options: SAMEORIGIN` ✓
  - `X-DNS-Prefetch-Control: off` ✓
- Запрос с `Origin: https://evil.com` → CORS блокирует.
- Запрос с `Origin: http://localhost:3001` → CORS пропускает.
- Запрос с `Origin: http://localhost:3002` → CORS пропускает.
- `GET /api/payments/success` и `GET /api/payments/fail` возвращают HTML без CSP-related runtime breakage.
- Открытие admin и client в браузере не даёт `blocked by CORS policy`.
- `npm run build` — без ошибок.
