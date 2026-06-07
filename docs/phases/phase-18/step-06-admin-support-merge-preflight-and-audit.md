# Шаг 6. Admin/support duplicate preflight и merge audit

> [Главный файл Phase 18](../phase-18-account-identity-linking-and-merge.md)

## Цель

Создать безопасный admin/support контур для анализа дублей и подготовки merge
решений без автоматического объединения пользователей в login flow.

## Что нужно сделать

- Добавить backend preflight endpoint для пары `sourceUserId -> targetUserId`.
- Preflight должен показать affected assets:
  - balances;
  - orders/eSIM;
  - transactions;
  - saved cards;
  - referral links;
  - promo owner policies;
  - reward snapshots;
  - push subscriptions;
  - notification targets;
  - identities.
- Зафиксировать conflict policy:
  - provider identity already linked;
  - both users have balances;
  - both users have saved cards;
  - source owns partner links/promos;
  - historical financial ledger.
- Добавить audit model или audit log record для merge decisions.
- Если mutation merge включается в этой фазе, реализовать его отдельным
  сервисом с transaction boundary и explicit operator/reason.
- Не вызывать merge из `AuthService` или OAuth callback.

## Результат шага

- Support может увидеть, что произойдет при merge, до любых мутаций.
- Любой merge имеет audit trail.
- Login resolver остается чистым identity resolver, а не hidden data mover.

## Зависимости

- Шаг 5.

## Статус

`planned`

## Журнал изменений

### 2026-06-06

- Шаг запланирован как late-stage capability после стабилизации identity lookup.

## Файлы

- `backend/prisma/schema.prisma`
- `backend/src/modules/users/*`
- `backend/src/modules/auth/*`
- `admin/components/Users.tsx`
- `admin/lib/api.ts`
- `admin/lib/types.ts`

## Тестирование / Верификация

- Preflight не меняет данные.
- Merge mutation, если реализована, атомарна и пишет audit.
- Login flow не вызывает merge service.
- Admin UI показывает blocking conflicts до подтверждения.
