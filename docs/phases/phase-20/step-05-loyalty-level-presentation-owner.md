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

`planned`

## Evidence

- Шаг создан при promotion входного plan в Phase 20.

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
