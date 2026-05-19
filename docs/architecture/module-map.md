# Module Map

> [Корневой документ wiki](../README.md)

## Repo Layout

```text
/
├── backend/   NestJS API + Prisma
├── admin/     Next.js 15 admin panel
├── client/    Next.js 14 user-facing web / Telegram mini app
├── bot/       Grammy Telegram bot
├── shared/    Shared TypeScript types
└── docs/      Project wiki
```

## Applications

### `backend`

Главный API и orchestration layer.

Подтвержденные backend-модули:

- `auth` — admin login, phone OTP, OAuth, Telegram auth, `/auth/me`
- `users` — пользователи, find-or-create, stats, email update, web-push subscriptions
- `products` — каталог, sync, dedupe, bulk activation/badge/markup operations
- `orders` — заказ, free fulfill, usage, top-up flow, balance purchase flow
- `payments` — Robokassa flow + CloudPayments webhooks/controllers
- `referrals` — регистрация рефералов, партнёрские ссылки (CRUD, analytics), статистика
- `loyalty` — client-facing `/loyalty/me`, admin CRUD уровней лояльности и пересчёт уровня пользователя после purchase completion
- `analytics` — dashboard, top-products, sales-chart
- `esim-provider` — eSIM Access integration, health, purchase, order info, webhook handling
- `system-settings` — referral settings, pricing, exchange rate, auto update
- `telegram` — Telegram notifications
- `notifications` — email, web push
- `traffic-monitor` — hourly fallback traffic/validity monitoring cron
- `promo-codes` — CRUD и validation промокодов

### `admin`

Next.js 15 Admin Panel (App Router, client-first rendering).

**Архитектура (после Phase 11):**

- **Routing:** App Router с route group `(admin)` для защищённых маршрутов, отдельный segment `/login`.
- **Auth:** `AuthProvider` (Context API) → `AuthGuard` (redirect) → Axios interceptor (401 → `CustomEvent('app:logout')`).
- **UI Primitives:** `Button`, `Modal`, `Toast/ToastProvider`, `ConfirmDialog`, `Table/SortableHeader`, `Spinner`, `Pagination` в `components/ui/`.
- **Error/Loading boundaries:** `error.tsx` и `loading.tsx` на уровне `(admin)` route group и `/login`.
- **URL State:** Фильтры и пагинация синхронизированы с `searchParams` через `router.replace()`.

Админка с вкладками:

- `dashboard`
- `orders` — сортировка, фильтрация, CSV export
- `users`
- `products` — декомпозирован: `ProductsPage`, `useProducts` hook, `ProductsFilters`, `ProductsTable`, `ProductEditModal` и др. (12 файлов в `components/products/`)
- `promo`
- `referral-links` — партнёрские ссылки (CRUD, copy links, analytics)
- `settings` — вкладки pricing / referrals / loyalty (URL tab sync)

Вкладки `payments` и `analytics` присутствуют в UI-navigation, но в текущем коде отрисовывают заглушки «в разработке».

### `client`

Пользовательский интерфейс с реальными route-группами:

- каталог и landing: `/`
- страна / тариф: `/country/[country]`, `/product/[id]`
- профиль и заказы: `/profile`, `/orders`, `/order/[id]`, `/my-esim`, `/loyalty`
- баланс и top-up: `/balance`, `/topup/[orderId]`
- auth: `/login`, `/login/callback`
- справка / legal: `/help/*`, `/offer`, `/agreement`
- referral/device/support pages: `/referrals`, `/devices`
- partner landing: `/ref/[code]`

### `bot`

Минимальный Telegram bot runtime:

- поднимает bot session/conversations
- регистрирует пользователя в backend
- использует backend API для products, orders, payments, referrals

### `shared`

Содержит только `types.ts` и не выглядит как полноценно используемая shared package со сборкой/экспортами.

## Data Layer

`backend/prisma/schema.prisma` подтверждает ключевые сущности:

- `User`
- `PushSubscription`
- `SmsCode`
- `LoyaltyLevel`
- `EsimProduct`
- `Order`
- `Transaction`
- `ReferralLink`
- `PromoCodeRedemption`
- `Notification`
- `PromoCode`
- `SystemSettings`
- `Admin`

Дополнительные поля, которые важны для понимания проекта:

- у `Order` есть cache полей usage/status (`lastUsageBytes`, `esimStatus`, `expiresAt`, ...)
- есть self-relation `parentOrderId` для top-up заказов
- у `User` есть поля под multi-auth и marketing attribution (`authProvider`, `providerId`, `utm*`)
