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
- `marketing-attribution` — campaign links, append-only trusted touches,
  user/order attribution snapshots, campaign audit, attribution/CPA reports и
  XLSX export; не владеет скидками, referral registration или partner rewards.
- `notifications` — email, web push. (Включает подмодуль `traffic-monitor` для мониторинга трафика/валидности)
- `orders` — заказ, free fulfill, usage, top-up flow, balance purchase flow
- `payments` — Robokassa flow + CloudPayments (сохранение карт, рекуррентные списания)
- `products` — каталог, sync, dedupe, bulk operations и admin-only Excel export; `products.filters.ts` владеет query-фильтрами списка тарифов (`country` как одиночное или повторяющееся multi-value значение, статус, provider `dataType`, объём MB/GB, срок в днях), `products.sorting.ts` строит Prisma `orderBy` для shared sort contract, `products.sort-keys.ts` владеет persisted sort keys для вычисляемых колонок (`dataAmountMb`, `providerCostPerGb`, `markupRatio`), а `products-export.service.ts` переиспользует эти owners для выгрузки полного filtered/sorted dataset без pagination. На write-boundary продукта `dataType` — единственный владелец типа данных; persisted `isUnlimited` хранится как производный legacy boolean для старых фильтров/заказов и пересчитывается сервисом из `dataType`.
- `promo-codes` — CRUD и валидация промокодов
- `referrals` — регистрация рефералов, партнёрские ссылки
- `system-settings` — настройки, pricing, exchange rate, auto update
- `telegram` — отправка Telegram notifications
- `users` — bot find-or-create, stats, email update, admin merge preflight,
  admin users list/detail read model; `users.sorting.ts` владеет backend
  mapping для shared users sort contract, `admin-user-read-model.ts` — admin
  safe list/detail serializer, `user-profile-read-model.ts` — user-facing
  whitelist serializer.

### `admin`

Next.js 15 Admin Panel (App Router).

**Архитектура:**
- `(admin)` — защищённые роуты: `dashboard`, `orders`, `users`, `products`, `promo`, `referral-links`, `settings`, `analytics`, `payments`
- `/login` — публичный auth сегмент
- **UI Primitives:** `Button`, `Modal`, `Toast/ToastProvider`, `ConfirmDialog`, `Table`, `Pagination` (`components/ui/`)
- **State:** URL State (фильтры/сортировки синхронизируются через `searchParams`; admin products multi-select направлений хранит выбор повторяющимися `country` params).
- `/users` — compact support table + detail modal над admin-safe users API:
  scan surface держит короткие identity/attribution/value fields, detail-only
  поля открываются через `GET /users/admin/:id`.

### `client`

Пользовательский интерфейс (Next.js 14). Текущие роуты (`client/app/`):

- **Каталог:** `/`, `/country`, `/product`
- **Профиль:** `/profile`, `/my-esim`, `/loyalty`
- **Заказы:** `/order`, `/orders`
- **Пополнение:** `/balance`, `/topup`
- **Auth:** `/login`
- **Партнерская программа:** `/ref`, `/referrals`
- **Маркетинговые входы:** `/r/[shortCode]` — thin campaign landing с
  backend-owned trusted capture; `/ref/[code]` остаётся отдельным referral flow
- **Info:** `/help`, `/agreement`, `/offer`, `/devices`, `/mojo-animation`

### `bot`

Telegram bot runtime (Grammy).
- Содержит `commands`, `scenes`, API интеграцию.
- Служит точкой входа пользователя в Telegram Web App (TWA).

### `shared`

- `types.ts` — общие интерфейсы.
- `contracts/` — (напр. `checkout.ts`) общие контракты, расшаренные между приложениями.
- `country-display.ts` — единый owner человекочитаемых названий ISO-стран и provider region codes для `client` и `admin`; фильтрующее значение остаётся исходным `country`.
- `product-data-type.ts` — единый owner provider data type codes `1..4`, точной eSIM Access taxonomy (`Data in Total`, `Daily Limit (Speed Reduced)`, `Daily Limit (Service Cut-off)`, `Daily Unlimited`) и русских подписей для UI/logs.
- `product-pricing.ts` — единый owner формул каталога для provider raw price `1/10000 USD`, RUB-пересчёта по курсу, наценки и финальной цены продукта; backend sync/reprice/export и admin products UI не дублируют эти формулы локально.
- `product-sorting.ts` — единый owner контракта сортируемых полей списка продуктов (`ProductSortField`, `ProductSortOrder`, default sort direction) для backend API и admin URL state.
- `user-sorting.ts` — единый owner контракта сортируемых полей admin users
  list (`UserSortField`, `UserSortOrder`, default sort direction) для backend
  API и admin URL state.
- `loyalty-level-presentation.ts` — единый owner presentation variants для
  loyalty badges; цвета не являются Prisma/runtime pricing данными.

## Data Layer

`backend/prisma/schema.prisma` содержит:

- **Users & Auth:** `User`, `UserIdentity`, `UserIdentityAudit`, `EmailCode`, `PushSubscription`
- **Catalog & Orders:** `EsimProduct`, `Order`, `PromoCode`, `PromoCodeRedemption`, `LoyaltyLevel`
- **Payments:** `Transaction`, `CloudPaymentsCardToken`, `RepeatChargeAttempt`
- **Providers:** `EsimWebhookReceipt`
- **Marketing:** `ReferralLink`, `MarketingCampaign`, `MarketingCampaignAudit`,
  `MarketingTouch`, `MarketingMiniAppCaptureIntent`,
  `UserMarketingAttribution`, `OrderMarketingAttribution`
- **System:** `SystemSettings`, `Admin`, `Notification`

**Ключевые архитектурные паттерны БД:**
- `Order` кэширует usage (`lastUsageBytes`, `esimStatus`, `expiresAt`) и поддерживает `parentOrderId` для top-up заказов.
- `User` является canonical owner для всех заказов, рефералок, транзакций.
- `UserIdentity` (OAuth, Telegram) выступает исключительно как durable point of entry (средство входа), но не владелец ресурсов.
