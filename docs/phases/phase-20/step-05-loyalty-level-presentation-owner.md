# Step 05 — Loyalty level presentation owner

> [Назад к Phase 20](../phase-20-admin-users-table-identity-attribution.md)

## Цель

Убрать локальный purple-only loyalty badge из users table и завести единый
presentation owner для цветов уровней без изменения runtime/pricing model.

## Что нужно сделать

- Провести reuse audit:
  - `rg -n "loyaltyLevel|LoyaltyLevel|Новичок|Бронза|Серебро|Золото|Платина|bg-purple" admin client backend shared`.
- Создать scoped presentation owner, например:
  - `shared/loyalty-level-presentation.ts`.
- Описать policy:
  - seeded levels получают стабильные variants;
  - custom levels получают deterministic fallback по `id` или `name`;
  - одинаковый уровень всегда рендерится одним variant.
- Добавить admin badge component для users table/detail.
- Не добавлять `color` в Prisma и не менять loyalty runtime.
- При наличии существующих badges не плодить вторую локальную карту.

## Результат шага

- Users table показывает разные уровни разными стабильными variants.
- Presentation policy переиспользуемая и тестируемая.
- Runtime loyalty docs/logic не смешаны с UI color policy.

## Не входит в scope

- Ручная настройка цвета уровня в админке.
- Prisma migration.
- Изменение скидок/cashback/thresholds.

## Зависимости

- Step 01.

## Статус

`completed`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.
- Preflight по Step 04 перед реализацией: live `rg` подтвердил, что
  `authProvider/providerId` остаются только в auth/backfill/merge-preflight
  blocker-path и тестах, admin users read model/types не возвращают legacy
  slot; `toUserProfileReadModel` остается whitelist boundary для user-facing
  responses. Regression:
  `pnpm --filter backend test -- users.controller.spec.ts users.service.spec.ts user-profile-read-model.spec.ts auth-identity-resolver.service.spec.ts auth.service.spec.ts`
  green (5 suites / 49 tests).
- Закрыт 2026-07-09: reuse audit
  `rg -n "loyaltyLevel|LoyaltyLevel|Новичок|Бронза|Серебро|Золото|Платина|bg-purple" admin client backend shared`
  подтвердил, что локальный purple-only badge живёт в `admin/components/Users.tsx`,
  product badges используют отдельный persisted product `badge/badgeColor`
  contract и не подходят для loyalty, а loyalty runtime не содержит color
  field.
- Добавлен shared presentation owner
  `shared/loyalty-level-presentation.ts`: seeded уровни получают стабильные
  variants, custom уровни получают deterministic fallback по `id` или `name`,
  отсутствующий cached level не маскируется под seeded `Новичок`.
- Добавлен `admin/components/users/LoyaltyLevelBadge.tsx`; users table больше
  не держит локальную `bg-purple-*` карту и рендерит variant через shared
  policy. Prisma schema, loyalty pricing/runtime и API response shape не
  менялись.
- `docs/architecture/loyalty-runtime.md` обновлен только как presentation
  boundary: цвета не являются runtime/pricing данными и не хранятся в БД.
- Verification 2026-07-09:
  `pnpm --filter backend test -- loyalty-level-presentation.spec.ts` green;
  `pnpm --filter admin build` green; `pnpm --filter admin lint` exit 0;
  `git diff --check` green.

## Файлы

- `shared/loyalty-level-presentation.ts`
- `admin/components/users/LoyaltyLevelBadge.tsx`
- `admin/components/Users.tsx` или новый users table component
- Shared/admin tests if project-local pattern supports them

## Тестирование / Верификация

- Unit test для deterministic fallback, если добавлен shared helper.
- `pnpm --filter admin build`
- `pnpm --filter admin lint`
- `git diff --check`
- Lookup IDs: `INV-REUSE-1`, `INV-SRP-1`, `INV-VER-1..2`.
