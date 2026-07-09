# Loyalty Runtime

> [Корневой документ wiki](../README.md)

> Актуальный runtime-контракт системы лояльности после wiring в purchase flow и loyalty hardening.

## Scope

Этот документ описывает:

- уровни лояльности и их смысл в runtime;
- где применяется скидка лояльности;
- где начисляется cashback;
- когда пересчитывается `loyaltyLevel`;
- какой API surface считается client-facing, а какой admin-only.

## Source Of Truth

- `backend/src/modules/loyalty/loyalty.service.ts`
- `backend/src/modules/loyalty/loyalty.controller.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `admin/components/Settings.tsx`

## Data Model

Система лояльности строится на двух сущностях:

- `LoyaltyLevel` с полями `name`, `minSpent`, `cashbackPercent`, `discount`
- `User.totalSpent` и `User.loyaltyLevelId`

Seed по умолчанию создаёт уровни от `Новичок` до `Платина`, но реальным source of truth остаются:

- актуальный список `LoyaltyLevel` в БД;
- `User.totalSpent`.

`loyaltyLevelId` больше нельзя трактовать как authoritative pricing source. Это denormalized cache для совместимости, admin/users listing и быстрых выборок.

## Runtime Behavior

### Discount before purchase

При создании заказа применяется скидка текущего уровня пользователя:

- effective уровень динамически вычисляется от `totalSpent` и текущих thresholds;
- discount считается от актуальной суммы заказа по этому effective уровню;
- discount применяется до использования бонусов;
- top-up flow сюда не относится.

### Cashback after successful purchase

После успешного завершения обычной покупки:

- cashback считается по effective уровню до инкремента `totalSpent`;
- в `bonusBalance` начисляется cashback;
- создаётся `BONUS_ACCRUAL` transaction;
- в metadata пишется `source: 'loyalty_cashback'` и `cashbackPercent`.

### Loyalty level recalculation

После успешной покупки:

1. начисляется cashback по текущему уровню;
2. увеличивается `User.totalSpent`;
3. затем вызывается `LoyaltyService.updateUserLevel()`.

Это означает, что новый уровень влияет только на следующие покупки, а не на уже завершённую. При этом `updateUserLevel()` синхронизирует denormalized `loyaltyLevelId` с уже вычисленной runtime-моделью.

### Top-up exclusion

Top-up заказы не должны:

- увеличивать `totalSpent`;
- начислять cashback;
- менять `loyaltyLevel`.

Граница purchase completion для loyalty живёт в `OrdersService.fulfillOrder()`, а top-up идёт отдельным путём.

## Bonus Wallet Boundary

Cashback не хранится в отдельном кошельке. Он попадает в общий `bonusBalance`, который также используется referral-модулем.

Текущая модель после referral follow-up:

- cashback-часть бонусов можно тратить без порога;
- referral-часть подчиняется `minPayout`;
- разбор referral/cashback при spend делается через ledger-модель в `OrdersService`.

## API Surface

### Client-facing route

- `GET /loyalty/me`
- guard: `JwtUserGuard`
- consumer: `client/app/loyalty/page.tsx`

Response shape:

- `totalSpent: number`
- `bonusBalance: number`
- `currentLevel: LoyaltyLevel | null`
- `nextLevel: LoyaltyLevel | null`
- `amountToNextLevel: number`
- `progressToNextLevel: number`
- `levels: LoyaltyLevel[]`
- `currentDiscount: number`
- `currentCashbackPercent: number`
- `effectiveLevelId: string | null`

Экран лояльности должен использовать именно этот endpoint, а не собирать правила программы из профиля, админских route-ов и локальных констант.

Этот же runtime helper должен использоваться и для checkout pricing, и для cashback awarding. `/loyalty/me` не имеет права обещать пользователю другой уровень, чем тот, который реально участвует в покупке.

### Admin routes

- `GET /loyalty/levels`
- `GET /loyalty/levels/:id`
- `POST /loyalty/levels`
- `PUT /loyalty/levels/:id`
- `DELETE /loyalty/levels/:id`
- `GET /loyalty/level/:levelId/users`

Guard:

- `GET /loyalty/me` -> `JwtUserGuard`
- admin routes -> `JwtAdminGuard`

Пользовательский клиент не должен ходить в admin CRUD routes.

## Admin UI

Управление уровнями сейчас живёт в админке в `Settings`:

- просмотр списка уровней;
- создание/редактирование `name`, `minSpent`, `cashbackPercent`, `discount`;
- удаление уровня.

Пользовательский loyalty cabinet живёт отдельно в `client/app/loyalty/page.tsx`.

После `create/update/delete` уровня backend сразу пересчитывает `loyaltyLevelId` у пользователей. Admin-изменения не должны оставлять промежуточное состояние, где экран `/loyalty` и checkout расходятся.

### Presentation Boundary

Цвета и варианты бейджей уровней лояльности не являются runtime/pricing
данными и не хранятся в Prisma. Presentation policy живёт в
`shared/loyalty-level-presentation.ts`: seeded уровни (`Новичок`, `Бронза`,
`Серебро`, `Золото`, `Платина`) получают стабильные variants, custom уровни
получают детерминированный fallback по `id` или `name`. Admin UI переводит
variant в локальные CSS/Tailwind classes на своей стороне.

## Verification Baseline

- `backend`: `npx jest src/modules/loyalty/loyalty.controller.spec.ts src/modules/orders/orders.service.spec.ts --runInBand`
- `backend`: `npx jest src/modules/loyalty/loyalty.service.spec.ts src/modules/loyalty/loyalty.controller.spec.ts src/modules/orders/orders.service.spec.ts --runInBand`
- `backend`: `npx tsc --noEmit -p tsconfig.json`
- `client`: `npx tsc --noEmit --incremental false`
- `client`: `npx next lint`

Runtime smoke before production:

- web/Telegram user открывает `/loyalty`;
- экран показывает текущий уровень, правила программы и порог до следующего уровня;
- admin меняет threshold/discount/cashback уровня, после чего `/loyalty` и checkout показывают и применяют одинаковый результат;
- admin удаляет уровень, пользователи сразу reassigned без ожидания следующей покупки;
- пользователь с текущим loyalty level делает покупку;
- скидка применяется в order pricing;
- после successful purchase начисляется cashback;
- `totalSpent` увеличивается;
- при достижении порога пользователь переходит на новый loyalty level;
- следующая покупка уже использует discount/cashback нового уровня;
- top-up заказ не меняет `totalSpent`, cashback и loyalty level.
