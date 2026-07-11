# Deployment

> [Корневой документ wiki](../README.md)

Этот файл описывает только подтвержденный operational baseline. Полная production readiness у проекта ещё не подтверждена; см. [../architecture/system-overview.md](../architecture/system-overview.md) и [../architecture/gotchas/README.md](../architecture/gotchas/README.md).

Для уже существующего Railway production с непустой БД действуют migrations-first правила:
[../architecture/gotchas/data-and-migrations.md](../architecture/gotchas/data-and-migrations.md)

Важно: `main` в GitHub привязан к Railway autodeploy. Это означает, что merge/push в production-ветку почти сразу запускает новый деплой. Для backend-изменений, затрагивающих Prisma startup flow, нужен отдельный rollout plan, а не обычный push.

## Перед деплоем

Нужно закрыть минимум:

- заполнить production `.env`
- выбрать primary payment flow
- проверить Telegram / OAuth callback URLs
- проверить, что eSIM provider credentials валидны
- проверить, что production БД согласована с baseline migration и текущей schema
- понять, запускает ли этот merge Railway autodeploy немедленно и готов ли production к такому rollout

## Рекомендуемый контур

- PostgreSQL
- Redis
- backend как отдельный process
- admin как отдельный process
- bot как отдельный process
- reverse proxy перед HTTP-сервисами

`client` собирается как отдельное приложение и развёртывается как независимый сервис в Railway (в том же проекте, что и `backend`/`admin`/`bot`). Это shared-monorepo consumer: TypeScript-контракты берутся из `shared/`, поэтому Railway должен собирать сервис из корня репозитория, а не из изолированного `/client`.

Railway client-service использует Config File `/client/railway.json`, пустой `Root Directory` и пустой UI `Custom Build Command`. Репозиторный конфиг владеет командами `pnpm --filter client build` / `pnpm --filter client start` и watch paths для `client/`, `shared/` и корневых workspace/lock/config файлов. `Root Directory=/client` недопустим: Railway исключает `shared/` из build context, а `next build` обязан разрешать даже type-only импорты `@shared/*` во время проверки TypeScript.

## Обязательные env-переменные

Минимальный production-набор:

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `BACKEND_URL`
- `FRONTEND_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `MINI_APP_URL`
- `SITE_URL`
- `NEXT_PUBLIC_API_URL`

`NEXT_PUBLIC_API_URL` — origin backend без `/api` и без завершающего `/`:
например, `https://api.mojomobile.ru`. Admin и client сами добавляют `/api`;
значение с уже включённым suffix создаёт неверный двойной API path.

Если нужен рабочий eSIM flow:

- `ESIMACCESS_ACCESS_CODE`
- `ESIMACCESS_SECRET_KEY`

Если нужен CloudPayments:

- `CLOUDPAYMENTS_PUBLIC_ID`
- `CLOUDPAYMENTS_API_SECRET`
- `CLOUDPAYMENTS_ENFORCE_HMAC=true`
- `NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID`

Если нужен Robokassa fallback:

- `ROBOKASSA_MERCHANT_LOGIN`
- `ROBOKASSA_PASSWORD1`
- `ROBOKASSA_PASSWORD2`
- `ROBOKASSA_TEST_MODE=false`

Если нужен OAuth:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`
- `VK_CLIENT_ID`, `VK_CLIENT_SECRET`

## Сборка

```bash
pnpm install
pnpm --filter backend build
pnpm --filter admin build
pnpm --filter client build
pnpm --filter bot build
```

## Запуск

Нужно запускать четыре приложения отдельно:

- `backend`
- `admin`
- `bot`
- `client`, если он развёрнут как Node/Next service, а не как отдельная PWA на Рег.ру

Примерно:

```bash
pnpm --filter backend start
pnpm --filter admin start
pnpm --filter bot start
pnpm --filter client start
```

## Миграционная стратегия

`backend/package.json` переведён на `prisma migrate deploy` в `start` и `start:prod`.

Это лучше прежнего `db push --accept-data-loss`, но всё равно требует дисциплины:

- baseline migration должен быть применён на новой БД;
- schema-изменения дальше нужно оформлять новыми migration-файлами;
- нельзя возвращаться к ad-hoc `db push` как к основной production стратегии.

Для уже существующей Railway production БД порядок такой:

1. backup;
2. `prisma migrate resolve --applied 20260507_init`;
3. `prisma migrate status`;
4. только потом merge/push в `main`, который вызовет Railway autodeploy.

Для Phase 21 marketing attribution migrations остаются additive и не создают
synthetic history. После deploy backend должен пройти readiness до публикации
campaign links. Отчёты считаются достоверными только для capture/order/reward
фактов, возникших после фактического rollout; legacy UTM/orders/referral state
не являются источником backfill.

## Reverse proxy

Минимум нужно маршрутизировать:

- `api.<domain>` -> backend
- `admin.<domain>` -> admin
- `www.<domain>` или основной домен -> client

`bot` обычно не публикуется напрямую как UI, но ему нужен доступ к backend и при webhook-режиме публичный callback URL.

## После деплоя

Проверить:

1. `/api/docs` открывается
2. client логин и каталог работают
3. admin открывается и читает backend API
4. bot запускается и может делать `find-or-create` по service-token contract (`x-telegram-bot-token`)
5. payment callbacks доходят
6. OAuth redirect/callback URLs совпадают с production hostnames
7. marketing campaign web link создаёт один touch при retry, bot `start` и
   Mini App `startapp` проходят trusted capture, primary order виден в
   attribution/CPA export, top-up исключён, SUPPORT mutation получает `403`
