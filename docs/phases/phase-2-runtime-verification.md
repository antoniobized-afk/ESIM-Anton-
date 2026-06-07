# Phase 2: Runtime Verification

> [Корневой документ wiki](../README.md)

## Цель

Подтвердить, что текущий репозиторий поднимается как рабочий runtime-контур, а не только как набор согласованных markdown-файлов.

## Результат

- зафиксирован план runtime-проверки;
- начата проверка toolchain и startup prerequisites;
- первые блокеры окружения документированы до перехода к полным user/admin/provider flows;
- подтвержден частично рабочий локальный контур: Docker healthy, backend отвечает, `/api/products` возвращает данные.
- подтвержден production build для `backend`, `bot`, `admin`, `client`.
- добавлен baseline Prisma migration и backend scripts переведены на `prisma migrate deploy`.
- расширена runtime-проверка backend/admin/client HTTP сценариями;
- исправлены два подтвержденных frontend/backend mismatch в `client`.
- создан tracker клиентских багов: [../info/bug-resolution.md](../info/bug-resolution.md).

## Оценка

Средний риск: здесь начинается столкновение документации с фактическим состоянием окружения, зависимостей и legacy-кода.

## Зависит от

- [phase-1-environment-and-config-hardening.md](./phase-1-environment-and-config-hardening.md)

## Пререквизиты

- наличие `pnpm`;
- рабочий Docker runtime;
- локальный `.env`, собранный из `.env.example`;
- доступность PostgreSQL и Redis.

## Архитектурные решения

- сначала проверяется toolchain и startup path;
- только потом запускаются приложений и user flows;
- любой блокер среды фиксируется в этой фазе как operational finding.

## Шаги (журналы)

### Шаг 1. Проверить toolchain и bootstrap path

### Цель

Понять, можно ли вообще выполнить repo scripts в текущем окружении.

### Что нужно сделать

- проверить `node`, `npm`, `pnpm`;
- при отсутствии `pnpm` восстановить доступ к package manager;
- затем запускать install/lint/build/start команды.

### Результат шага

`node` и `npm` доступны, но `pnpm` в sandbox-среде оказался непригоден из-за записи в профиль пользователя. Для продолжения проверки пришлось:

- установить зависимости через `npm install` вне sandbox;
- собирать/запускать пакеты через `npm workspaces`;
- отдельно эскалировать команды, которым нужны Prisma binaries, Docker daemon или Next SWC.

### Шаг 2. Поднять сервисы

### Цель

Проверить startup backend, admin, client и bot.

### Что нужно сделать

- установить зависимости;
- поднять `docker-compose`;
- применить миграции/seed;
- запустить `backend`, `admin`, `client`, `bot`.

### Результат шага

Подтверждено следующее:

- `docker-compose up -d` поднимает `esim-postgres` и `esim-redis`, оба healthy;
- `backend` build проходит;
- `bot` build проходит;
- `admin` build проходит, но с ESLint warning'ами по unused vars;
- `client` build проходит после двух исправлений:
  - явное добавление Windows SWC optional dependency;
  - удаление `next/font/google` из `client/app/layout.tsx`, чтобы build не зависел от внешнего fetch шрифтов;
- `backend` стартует локально и отвечает `200` на `/api/docs`;
- после baseline/apply и seed backend стартует через `prisma migrate deploy` и отвечает `200` на `/api/products`;
- `ProductsService` при старте видит `18` продуктов в локальной БД после seed.
- в репозиторий добавлен baseline migration `backend/prisma/migrations/20260507_init/migration.sql`.

### Шаг 3. Проверить ключевые сценарии

### Цель

Проверить реальные product и operational flows.

### Что нужно сделать

- открыть `/api/docs`;
- проверить admin доступ и загрузку API;
- проверить client login/catalog/balance/order flows;
- проверить bot startup и `find-or-create`;
- проверить provider/payment prerequisites.

### Результат шага

Подтверждено:

- `GET /api/docs` отдаёт Swagger UI;
- `GET /api/products` отдаёт seeded catalog;
- `GET /api/products/countries` отдаёт страны: Европа, ОАЭ, США, Таиланд, Турция, Япония;
- `POST /api/users/find-or-create` создаёт/находит Telegram-style пользователя;
- `GET /api/users/:id/stats` отдаёт user stats;
- `GET /api/orders/user/:userId` отдаёт список заказов пользователя;
- `GET /api/orders` и `GET /api/payments` отвечают для admin-facing списков;
- `GET /api/users/push/vapid-public-key` отвечает, но без VAPID env возвращает пустой `publicKey`;
- admin dev server на `3001` стартует и отдаёт `/` с `200`;
- client dev server на `3002` стартует и отдаёт `/`, `/referrals`, `/balance` с `200`;
- `GET /api/referrals/stats/:userId` и `GET /api/payments/user/:userId` подтверждены как реальные backend routes;
- `client` production build проходит после исправлений;
- `npx tsc --noEmit -p client/tsconfig.json` проходит.

Исправлено в коде:

- `client/lib/api.ts`: `referralsApi.getStats()` теперь ходит в `/referrals/stats/:userId`, а не в несуществующий `/referrals/:userId/stats`;
- `client/lib/api.ts`: `referralsApi.getReferrals()` получает список из stats response, потому что отдельного backend route `/referrals/:userId` нет;
- `client/app/balance/page.tsx`: история транзакций теперь запрашивается через `/payments/user/:userId`, а не через несуществующий `/users/:userId/transactions`.

Связь с клиентским списком багов ведётся в [../info/bug-resolution.md](../info/bug-resolution.md).

Ограничения:

- аккуратно проверить baseline/apply сценарий для уже существующих БД.
  Это частично подтверждено на локальной БД через `migrate resolve --applied 20260507_init`, потому что база уже была создана старым flow до появления migration baseline.
- bot runtime напрямую не запускался: `bot/src/config.ts` всегда загружает корневой `.env`, а правила проекта запрещают читать боевой env файл. Вместо этого проверен backend contract, который bot использует.
- provider/payment happy-path не подтверждён без реальных `ESIMACCESS_*`, `CLOUDPAYMENTS_*`/Robokassa credentials и webhook окружения.
- full browser E2E с авторизацией/покупкой ещё не завершён.

## Верификация

- runtime verification считается завершённой только после фактического запуска контура или фиксации доказанных блокеров;
- блокер `pnpm` обойдён через `npm workspaces`;
- текущие подтвержденные проблемы:
  - `admin` build проходит с warning'ами;
  - web-push отключён без VAPID keys;
  - SMS/email/payment/provider runtime остаются credential-dependent;
  - full purchase/top-up happy-path ещё не прогнан end-to-end.
