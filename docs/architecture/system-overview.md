# System Overview

> [Корневой документ wiki](../README.md)

## Что это за проект сейчас

Репозиторий представляет собой `pnpm` monorepo с пятью пакетами:

- `backend` — NestJS API на TypeScript.
- `admin` — Next.js 15 админка.
- `client` — отдельный пользовательский Next.js 14 web/mini-app клиент.
- `bot` — Telegram bot на `grammy`.
- `shared` — общие TS-типы.

Это не микросервисная система. По коду это модульный монолит с несколькими клиентами поверх одного backend API.

## Продуктовая форма

Система обслуживает продажу и сопровождение eSIM:

- каталог тарифов;
- покупка eSIM;
- пополнение личного баланса;
- top-up уже выданной eSIM;
- рефералка и лояльность;
- пользовательская авторизация;
- уведомления в Telegram / email / web push;
- внутренняя админка для управления каталогом и настройками.

## Реальные runtime-компоненты

### Backend

- NestJS 10
- Prisma + PostgreSQL
- Redis заявлен в инфраструктуре и зависимостях, но в просмотренном коде основные флоу на нём не завязаны напрямую
- Swagger на `/api/docs`
- глобальный префикс API: `/api`

### User Client

- Next.js 14 + React 18
- ориентирован на `app.mojomobile.ru`
- содержит страницы каталога, профиля, баланса, заказов, помощи, top-up, login callback
- интегрирован с Telegram WebApp SDK и CloudPayments widget

### Admin

- Next.js 15 + React 19
- single-page dashboard c табами
- логин уже идёт через backend `POST /api/auth/login`, admin JWT хранится в `localStorage` и пробрасывается в `Authorization: Bearer ...`

### Bot

- `grammy`
- при первом контакте вызывает `POST /api/users/find-or-create` с `x-telegram-bot-token`
- использует backend как source of truth, а не собственное хранилище

## Ключевые внешние интеграции

- eSIM Access — фактически основной провайдер в `EsimProviderService`
- eSIM Go / fallback provider — legacy-ветка совместимости
- CloudPayments — основной карточный поток для balance top-up и поддерживаемый webhook flow
- Robokassa — legacy/fallback платежный поток, код всё ещё активен
- Telegram Bot API / Telegram WebApp
- OAuth: Google, Yandex, VK
- ЦБ РФ JSON API для курса USD/RUB

## Главные архитектурные факты, подтвержденные кодом

- Проект использует один backend для `admin`, `client` и `bot`.
- Пользовательский `client` уже существует и существенно шире, чем описано в старом `README.md`.
- Платежная модель гибридная: CloudPayments и Robokassa сосуществуют.
- eSIM lifecycle включает покупку, webhooks для моментальных уведомлений о трафике/статусе (push-модель), fallback usage polling (крон) и top-up.
- Auth уже не только Telegram: live code подтверждает email OTP, OAuth
  Google/Yandex/VK, Telegram Login Widget и Telegram WebApp auth. Phone сейчас
  является profile/contact field, а не подтвержденным login flow.
- Web campaign attribution остаётся backend-owned: public capture принимает
  только opaque browser keys, persist-ит лишь их HMAC, а post-JWT claim
  связывает pending touches с canonical `user.id`; registration snapshot
  доступен только account, созданному в том же email/OAuth flow. Детали и
  Telegram boundary — в `marketing-attribution-runtime.md`.
