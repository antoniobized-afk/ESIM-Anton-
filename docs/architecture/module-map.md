# Module Map

> [Корневой документ wiki](../README.md)

## Repo Layout

```text
/
├── backend/   NestJS API + Prisma
├── admin/     Next.js 15 admin panel
├── client/    Next.js 14 user-facing web / Telegram mini app
├── bot/       Grammy Telegram bot
├── shared/    Shared TypeScript types и контракты
└── docs/      Project wiki
```

## Applications

### `backend`

Главный API и orchestration layer. Top-level модули (`backend/src/modules/`):

- `analytics` — dashboard, top-products, sales-chart
- `auth` — admin login, email OTP, OAuth, Telegram auth, `/auth/me`, customer identity resolver, link/unlink API
- `esim-provider` — eSIM Access integration, webhook handling
- `loyalty` — `/loyalty/me`, CRUD уровней, пересчёт уровня после purchase
- `notifications` — email, web push. (Включает подмодуль `traffic-monitor` для мониторинга трафика/валидности)
- `orders` — заказ, free fulfill, usage, top-up flow, balance purchase flow
- `payments` — Robokassa flow + CloudPayments (сохранение карт, рекуррентные списания)
- `products` — каталог, sync, dedupe, bulk operations
- `promo-codes` — CRUD и валидация промокодов
- `referrals` — регистрация рефералов, партнёрские ссылки
- `system-settings` — настройки, pricing, exchange rate, auto update
- `telegram` — отправка Telegram notifications
- `users` — bot find-or-create, stats, email update, admin merge preflight

### `admin`

Next.js 15 Admin Panel (App Router).

**Архитектура:**
- `(admin)` — защищённые роуты: `dashboard`, `orders`, `users`, `products`, `promo`, `referral-links`, `settings`, `analytics`, `payments`
- `/login` — публичный auth сегмент
- **UI Primitives:** `Button`, `Modal`, `Toast/ToastProvider`, `ConfirmDialog`, `Table`, `Pagination` (`components/ui/`)
- **State:** URL State (фильтры/сортировки синхронизируются через `searchParams`).

### `client`

Пользовательский интерфейс (Next.js 14). Текущие роуты (`client/app/`):

- **Каталог:** `/`, `/country`, `/product`
- **Профиль:** `/profile`, `/my-esim`, `/loyalty`
- **Заказы:** `/order`, `/orders`
- **Пополнение:** `/balance`, `/topup`
- **Auth:** `/login`
- **Партнерская программа:** `/ref`, `/referrals`
- **Info:** `/help`, `/agreement`, `/offer`, `/devices`, `/mojo-animation`

### `bot`

Telegram bot runtime (Grammy).
- Содержит `commands`, `scenes`, API интеграцию.
- Служит точкой входа пользователя в Telegram Web App (TWA).

### `shared`

- `types.ts` — общие интерфейсы.
- `contracts/` — (напр. `checkout.ts`) общие контракты, расшаренные между приложениями.

## Data Layer

`backend/prisma/schema.prisma` содержит:

- **Users & Auth:** `User`, `UserIdentity`, `UserIdentityAudit`, `EmailCode`, `PushSubscription`
- **Catalog & Orders:** `EsimProduct`, `Order`, `PromoCode`, `PromoCodeRedemption`, `LoyaltyLevel`
- **Payments:** `Transaction`, `CloudPaymentsCardToken`, `RepeatChargeAttempt`
- **Providers:** `EsimWebhookReceipt`
- **Marketing:** `ReferralLink`
- **System:** `SystemSettings`, `Admin`, `Notification`

**Ключевые архитектурные паттерны БД:**
- `Order` кэширует usage (`lastUsageBytes`, `esimStatus`, `expiresAt`) и поддерживает `parentOrderId` для top-up заказов.
- `User` является canonical owner для всех заказов, рефералок, транзакций.
- `UserIdentity` (OAuth, Telegram) выступает исключительно как durable point of entry (средство входа), но не владелец ресурсов.
