# Runtime And Operations

> [Корневой документ wiki](../README.md)

## Workspace and ports

Root `package.json` подтверждает следующие dev entrypoints:

- `pnpm dev` — запускает `backend`, `admin`, `bot`
- `client` в общий `dev` script не включен и поднимается отдельно
- root `build` сейчас запускает `cd client && npm install --legacy-peer-deps && npm run build`, несмотря на `packageManager: pnpm@9.1.0` и наличие `client` в `pnpm-workspace.yaml`

Ожидаемые порты по коду:

- backend: `3000`
- admin: `3001`
- client: `3002`

## Infrastructure

`docker-compose.yml` поднимает:

- PostgreSQL 16 (`esim-postgres`)
- Redis 7 (`esim-redis`)

Production topology по проверенным документам и коду выглядит так:

- `backend`, `admin` и `bot` живут на Railway
- production PostgreSQL и Redis тоже ожидаются на Railway
- `client` описан как отдельное приложение и развёртывается как независимый сервис в Railway.
- push в `main` GitHub запускает Railway autodeploy, поэтому backend-изменения нельзя рассматривать как "просто смержим и потом вручную доделаем на проде"

## Seeds and bootstrap

Файл `backend/prisma/seed.ts` делает следующее:

- создаёт `SUPER_ADMIN` с `admin@esim-service.com`
- создаёт 5 loyalty levels
- создаёт 18 seed products
- создаёт базовые `system_settings`

Важно:

- сид не использует `upsert` для продуктов, только `create`
- повторный запуск seed вероятно приведёт к дубликатам товаров

## Auth runtime

Фактические пользовательские способы входа:

- email OTP
- Google OAuth
- Yandex OAuth
- VK OAuth
- Telegram Login Widget
- Telegram WebApp init data

Phone в live code сейчас является profile/contact field, а не подтвержденным
login flow.

Отдельно существует admin login endpoint, и текущий `admin` frontend использует
его через `POST /api/auth/login`.

## Payments runtime

Проект находится в переходном состоянии:

- CloudPayments — активный современный поток для top-up личного баланса и подключенный webhook-контроллер
- Robokassa — старый поток для заказа и fallback balance top-up, код всё ещё живой

Следствие:

- старую документацию про "один платёжный провайдер" нельзя считать точной
- для production нужно явно выбрать основной платёжный контур и убрать двусмысленность

## eSIM runtime

По коду `EsimProviderService`:

- основной рабочий путь — `EsimAccessProvider`
- Webhook-контроллер `EsimWebhookService` принимает Push-уведомления от eSIM Access (трафик 80/100%, статус, истечение)
- live provider runtime уже показывал mixed auth contract: `CHECK_HEALTH` и часть `ORDER_STATUS` могут прийти без `RT-Signature/RT-Timestamp/RT-RequestID`, но с `rt-accesscode`; source of truth здесь текущий guard, а не старая фазовая формулировка
- degraded-auth compatibility path теперь явно ограничен:
  - без подписи допускается только `CHECK_HEALTH`;
  - unsigned `rt-accesscode` path допускает только `ORDER_STATUS`;
  - для unsigned `ORDER_STATUS` действует freshness window и durable replay barrier через `esim_webhook_receipts`
- legacy-код под eSIM Go/fallback всё ещё существует
- `syncProducts()` в provider service пока не обновляет БД реально, а только возвращает счётчик пакетов

## Cron jobs and background behavior

Подтвержденные фоновые задачи:

- ежедневное автообновление курса USD/RUB (`SystemSettingsService`)
- hourly traffic monitor (fallback-механизм) для проверки остатка трафика (<10%) и срока действия (<24ч) eSIM (`TrafficMonitorService`)

## Operational gaps

- `.env.example` восстановлен, но его нужно поддерживать синхронно с кодом при каждом изменении env surface
- backend `start` и `start:prod` переведены на `prisma migrate deploy`
- client и admin используют разные major-версии Next/React
- В репозитории одновременно есть root `pnpm-lock.yaml` и root `package-lock.json`; `client` покрыт pnpm workspace lock, но root build использует npm install внутри `client`. До отдельного решения deploy strategy нельзя добавлять `client/package-lock.json`, чтобы не создать третий source of truth.
- Безопасный дальнейший путь для package manager зависит от деплоя: если Railway/client стартует из root, предпочтительнее `pnpm --filter client build` и root `pnpm-lock.yaml`; если client деплоится standalone, нужно явно оформить npm-контур и хранить `client/package-lock.json` осознанно.
- часть корневых документов переведена в archival mode; старые инженерные утверждения нужно брать из wiki, а не из исторических summary/checklist файлов
- в Phase 2 подтверждено, что `backend`, `bot`, `admin` и `client` собираются; для `admin/client` потребовалась стабилизация workspace-зависимостей и запуск build вне sandbox
- в Phase 2 подтверждено, что backend HTTP smoke routes, admin `/`, client `/`, `/referrals`, `/balance` локально отвечают `200`
- в Phase 2 исправлены client/backend route mismatches для referral stats и balance transaction history
- в Phase 2 добавлен baseline migration в `backend/prisma/migrations`, но существующие уже поднятые БД всё ещё нужно аккуратно baseline/apply'ить
- из-за Railway autodeploy по push в `main` любые изменения backend startup flow требуют отдельного rollout-плана, а не обычного merge-to-prod
- bot runtime напрямую не запускался в verification-сессии, потому что `bot/src/config.ts` загружает корневой `.env`; проверен backend contract, который bot использует
